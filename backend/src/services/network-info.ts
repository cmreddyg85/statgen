import { execFile } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { networkInterfaces } from 'node:os';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const run = promisify(execFile);

/** What a login was made from, as far as the server can actually tell. */
export interface ClientInfo {
  ipAddress: string | null;
  /** Reverse DNS of the address, when it resolves. */
  hostname: string | null;
  /** The network the address belongs to: the ISP's domain, or "Local network". */
  provider: string | null;
  /**
   * Only knowable when the client shares a network segment with this server —
   * a browser never sends its MAC, so this is an ARP lookup and is null for
   * anything beyond the local subnet.
   */
  macAddress: string | null;
  browser: string | null;
  operatingSystem: string | null;
  device: string | null;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const isLoopback = (ip: string) => ip === '127.0.0.1' || ip === '::1';

function isPrivate(ip: string): boolean {
  if (isLoopback(ip)) return true;
  if (!IPV4.test(ip)) return ip.startsWith('fd') || ip.startsWith('fe80');
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** This host's own hardware address, used when the client is this machine. */
function ownMac(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.mac && address.mac !== '00:00:00:00:00:00') {
        return address.mac;
      }
    }
  }
  return null;
}

/**
 * ARP only answers for neighbours on the same segment, which is exactly the
 * case this internal portal runs in. Anything else returns null.
 */
async function lookupMac(ip: string): Promise<string | null> {
  if (isLoopback(ip)) return ownMac();
  if (!IPV4.test(ip) || !isPrivate(ip)) return null;

  try {
    const { stdout } = await run('arp', ['-n', ip], { timeout: 500 });
    return stdout.match(/([0-9a-f]{1,2}:){5}[0-9a-f]{1,2}/i)?.[0] ?? null;
  } catch {
    return null;
  }
}

async function lookupHostname(ip: string): Promise<string | null> {
  if (isPrivate(ip)) return null;
  try {
    const [hostname] = await dns.reverse(ip);
    return hostname ?? null;
  } catch {
    return null;
  }
}

/**
 * The provider that owns the address. Reverse DNS is the only source that
 * needs no third party and no account: `broadband.airtel.in` for a home line,
 * the hosting company for a VPN or data centre.
 */
function providerFrom(ip: string, hostname: string | null): string | null {
  if (isPrivate(ip)) return 'Local network';
  if (!hostname) return null;
  const labels = hostname.split('.');
  return labels.length > 2 ? labels.slice(-3).join('.') : hostname;
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)/, 'Opera'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
];

const SYSTEMS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/Windows NT ([\d.]+)/, (m) => `Windows ${({ '10.0': '10/11', '6.3': '8.1', '6.1': '7' }[m[1]!] ?? m[1])}`],
  [/Mac OS X ([\d_.]+)/, (m) => `macOS ${m[1]!.replace(/_/g, '.')}`],
  [/Android ([\d.]+)/, (m) => `Android ${m[1]}`],
  [/(?:iPhone|iPad) OS ([\d_]+)/, (m) => `iOS ${m[1]!.replace(/_/g, '.')}`],
  [/(CrOS)/, () => 'ChromeOS'],
  [/(Linux)/, () => 'Linux'],
];

/** Browser, OS and form factor, as far as the user agent states them. */
export function describeDevice(userAgent: string | null): Pick<
  ClientInfo,
  'browser' | 'operatingSystem' | 'device'
> {
  if (!userAgent) return { browser: null, operatingSystem: null, device: null };

  let browser: string | null = null;
  for (const [pattern, name] of BROWSERS) {
    const match = userAgent.match(pattern);
    if (match) {
      browser = `${name} ${match[1]?.split('.')[0] ?? ''}`.trim();
      break;
    }
  }

  let operatingSystem: string | null = null;
  for (const [pattern, format] of SYSTEMS) {
    const match = userAgent.match(pattern);
    if (match) {
      operatingSystem = format(match);
      break;
    }
  }

  const device = /iPad|Tablet/i.test(userAgent)
    ? 'Tablet'
    : /Mobi|Android|iPhone/i.test(userAgent)
      ? 'Mobile'
      : 'Desktop';

  return { browser, operatingSystem, device };
}

/**
 * Everything worth auditing about where a sign-in came from. Never throws and
 * never blocks a login: a lookup that fails or times out simply reports null.
 */
export async function describeClient(
  ipAddress: string | null,
  userAgent: string | null,
): Promise<ClientInfo> {
  const device = describeDevice(userAgent);
  if (!ipAddress) return { ipAddress: null, hostname: null, provider: null, macAddress: null, ...device };

  try {
    const [hostname, macAddress] = await Promise.all([
      lookupHostname(ipAddress),
      lookupMac(ipAddress),
    ]);
    return {
      ipAddress,
      hostname,
      provider: providerFrom(ipAddress, hostname),
      macAddress,
      ...device,
    };
  } catch (error) {
    logger.warn({ error }, 'client lookup failed');
    return { ipAddress, hostname: null, provider: null, macAddress: null, ...device };
  }
}
