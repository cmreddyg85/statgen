/**
 * Bank and branch options for the generate-record form.
 *
 * Static reference data — an IFSC belongs to exactly one bank, so the branch
 * dropdown is driven off the selected bank.
 */
export interface Branch {
  ifsc: string;
  city: "Hyderabad" | "Bangalore" | "Mumbai";
  branch: string;
}

export interface Bank {
  code: string;
  name: string;
  branches: Branch[];
}

export const BANKS: Bank[] = [
  {
    code: "SBIN",
    name: "State Bank of India",
    branches: [
      { ifsc: "SBIN0020089", city: "Hyderabad", branch: "Banjara Hills" },
      { ifsc: "SBIN0020090", city: "Hyderabad", branch: "Secunderabad Main" },
      { ifsc: "SBIN0020091", city: "Hyderabad", branch: "Gachibowli" },
      { ifsc: "SBIN0040135", city: "Bangalore", branch: "Koramangala" },
      { ifsc: "SBIN0040136", city: "Bangalore", branch: "Indiranagar" },
      { ifsc: "SBIN0040137", city: "Bangalore", branch: "Whitefield" },
      { ifsc: "SBIN0000300", city: "Mumbai", branch: "Fort Main" },
      { ifsc: "SBIN0000301", city: "Mumbai", branch: "Andheri East" },
      { ifsc: "SBIN0000302", city: "Mumbai", branch: "Bandra Kurla Complex" },
      { ifsc: "SBIN0000303", city: "Mumbai", branch: "Powai" },
    ],
  },
  {
    code: "HDFC",
    name: "HDFC Bank",
    branches: [
      { ifsc: "HDFC0000032", city: "Hyderabad", branch: "Jubilee Hills" },
      { ifsc: "HDFC0000033", city: "Hyderabad", branch: "Madhapur" },
      { ifsc: "HDFC0000034", city: "Hyderabad", branch: "Kukatpally" },
      { ifsc: "HDFC0000121", city: "Bangalore", branch: "MG Road" },
      { ifsc: "HDFC0000122", city: "Bangalore", branch: "HSR Layout" },
      { ifsc: "HDFC0000123", city: "Bangalore", branch: "Electronic City" },
      { ifsc: "HDFC0000240", city: "Mumbai", branch: "Nariman Point" },
      { ifsc: "HDFC0000241", city: "Mumbai", branch: "Malad West" },
      { ifsc: "HDFC0000242", city: "Mumbai", branch: "Thane West" },
      { ifsc: "HDFC0000243", city: "Mumbai", branch: "Goregaon East" },
    ],
  },
  {
    code: "ICIC",
    name: "ICICI Bank",
    branches: [
      { ifsc: "ICIC0000018", city: "Hyderabad", branch: "Somajiguda" },
      { ifsc: "ICIC0000019", city: "Hyderabad", branch: "Hitech City" },
      { ifsc: "ICIC0000020", city: "Hyderabad", branch: "Ameerpet" },
      { ifsc: "ICIC0000217", city: "Bangalore", branch: "Jayanagar" },
      { ifsc: "ICIC0000218", city: "Bangalore", branch: "Marathahalli" },
      { ifsc: "ICIC0000219", city: "Bangalore", branch: "Rajajinagar" },
      { ifsc: "ICIC0000104", city: "Mumbai", branch: "Churchgate" },
      { ifsc: "ICIC0000105", city: "Mumbai", branch: "Dadar West" },
      { ifsc: "ICIC0000106", city: "Mumbai", branch: "Vashi" },
      { ifsc: "ICIC0000107", city: "Mumbai", branch: "Borivali East" },
    ],
  },
  {
    code: "PUNB",
    name: "Punjab National Bank",
    branches: [
      { ifsc: "PUNB0281500", city: "Hyderabad", branch: "Abids" },
      { ifsc: "PUNB0281600", city: "Hyderabad", branch: "Begumpet" },
      { ifsc: "PUNB0281700", city: "Hyderabad", branch: "LB Nagar" },
      { ifsc: "PUNB0303900", city: "Bangalore", branch: "Malleshwaram" },
      { ifsc: "PUNB0304000", city: "Bangalore", branch: "BTM Layout" },
      { ifsc: "PUNB0304100", city: "Bangalore", branch: "Yelahanka" },
      { ifsc: "PUNB0041200", city: "Mumbai", branch: "Fort" },
      { ifsc: "PUNB0041300", city: "Mumbai", branch: "Chembur" },
      { ifsc: "PUNB0041400", city: "Mumbai", branch: "Kandivali West" },
      { ifsc: "PUNB0041500", city: "Mumbai", branch: "Mulund East" },
    ],
  },
  {
    code: "UTIB",
    name: "Axis Bank",
    branches: [
      { ifsc: "UTIB0000078", city: "Hyderabad", branch: "Punjagutta" },
      { ifsc: "UTIB0000079", city: "Hyderabad", branch: "Kondapur" },
      { ifsc: "UTIB0000080", city: "Hyderabad", branch: "Dilsukhnagar" },
      { ifsc: "UTIB0000145", city: "Bangalore", branch: "Richmond Road" },
      { ifsc: "UTIB0000146", city: "Bangalore", branch: "Bellandur" },
      { ifsc: "UTIB0000147", city: "Bangalore", branch: "Hebbal" },
      { ifsc: "UTIB0000004", city: "Mumbai", branch: "Worli" },
      { ifsc: "UTIB0000005", city: "Mumbai", branch: "Ghatkopar East" },
      { ifsc: "UTIB0000006", city: "Mumbai", branch: "Lower Parel" },
      { ifsc: "UTIB0000007", city: "Mumbai", branch: "Navi Mumbai Belapur" },
    ],
  },
  {
    code: "KKBK",
    name: "Kotak Mahindra Bank",
    branches: [
      {
        ifsc: "KKBK0007458",
        city: "Hyderabad",
        branch: "Road No 1 Banjara Hills",
      },
      { ifsc: "KKBK0007459", city: "Hyderabad", branch: "Miyapur" },
      { ifsc: "KKBK0007460", city: "Hyderabad", branch: "Uppal" },
      { ifsc: "KKBK0008061", city: "Bangalore", branch: "Church Street" },
      { ifsc: "KKBK0008062", city: "Bangalore", branch: "Sarjapur Road" },
      { ifsc: "KKBK0008063", city: "Bangalore", branch: "Banashankari" },
      { ifsc: "KKBK0000958", city: "Mumbai", branch: "Nariman Point" },
      { ifsc: "KKBK0000959", city: "Mumbai", branch: "Santacruz West" },
      { ifsc: "KKBK0000960", city: "Mumbai", branch: "Kurla West" },
      { ifsc: "KKBK0000961", city: "Mumbai", branch: "Vile Parle East" },
    ],
  },
];

export const branchesFor = (bankCode: string): Branch[] =>
  BANKS.find((bank) => bank.code === bankCode)?.branches ?? [];

/** The narration previewed under Salary credit text. */
export const salaryNarration = (
  ifsc: string,
  bankCode: string,
  creditText: string,
): string =>
  `DEP TFR NEFT-${ifsc || "IFSC"}*${bankCode || "BANK"}-{{TraNum}}-${creditText || "{{ShortMonth}} Salary Credited"}`;
