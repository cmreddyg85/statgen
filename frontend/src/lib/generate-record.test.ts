import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyCompany,
  emptyForm,
  emptyHike,
  fromPayload,
  toPayload,
  validate,
  type CompanyInput,
  type GenerateRecordInput,
} from './generate-record.ts';

function company(overrides: Partial<CompanyInput> = {}): CompanyInput {
  return {
    ...emptyCompany(),
    name: 'Acme Corp',
    joiningDate: '2024-01-01',
    relievingDate: '2024-12-31',
    salary: '50000',
    bank: 'HDFC',
    ifsc: 'HDFC0000032',
    salaryCreditText: 'SAL{{ShortMonth}}{{ShortYear}}',
    ...overrides,
  };
}

const form = (overrides: Partial<GenerateRecordInput> = {}): GenerateRecordInput => ({
  ...emptyForm(),
  companies: [company()],
  documentName: 'statement.pdf',
  ...overrides,
});

test('a complete single company passes', () => {
  assert.deepEqual(validate(form()), {});
});

test('a stored payload rebuilds the same form', () => {
  const original = form({
    salaryDay: '12',
    nextWorkingDay: true,
    fullAndFinalCredited: false,
    companies: [company({ hikes: [{ id: 'h1', date: '2024-06-01', salary: '70000' }] })],
  });
  const rebuilt = fromPayload({
    ...toPayload(original),
    bankStatementFirstPage: original.documentName,
  });

  assert.deepEqual(validate(rebuilt), {});
  assert.deepEqual(toPayload(rebuilt), toPayload(original));
});

test('the bank statement first page is required', () => {
  const errors = validate(form({ documentName: null }));
  assert.match(errors.document, /first page/);
});

test('relieving date must be after joining date', () => {
  const errors = validate(form({ companies: [company({ relievingDate: '2023-12-31' })] }));
  assert.match(errors['companies.0.relievingDate'], /after the joining date/);
});

test('next company must start after the previous one ends', () => {
  const errors = validate(
    form({
      companies: [
        company(),
        company({ joiningDate: '2024-06-01', relievingDate: '2025-06-01' }),
      ],
    }),
  );
  assert.match(errors['companies.1.joiningDate'], /previous company/);

  const ok = validate(
    form({
      companies: [
        company(),
        company({ joiningDate: '2025-01-01', relievingDate: '2025-06-01', salary: '60000' }),
      ],
    }),
  );
  assert.equal(ok['companies.1.joiningDate'], undefined);
});

test('hike dates stay inside the employment period', () => {
  const before = validate(
    form({ companies: [company({ hikes: [{ ...emptyHike(), date: '2023-06-01', salary: '60000' }] })] }),
  );
  assert.match(before['companies.0.hikes.0.date'], /after the joining date/);

  const after = validate(
    form({ companies: [company({ hikes: [{ ...emptyHike(), date: '2025-06-01', salary: '60000' }] })] }),
  );
  assert.match(after['companies.0.hikes.0.date'], /before the relieving date/);
});

test('hikes must run in order and keep rising', () => {
  const outOfOrder = validate(
    form({
      companies: [
        company({
          hikes: [
            { ...emptyHike(), date: '2024-09-01', salary: '60000' },
            { ...emptyHike(), date: '2024-03-01', salary: '70000' },
          ],
        }),
      ],
    }),
  );
  assert.match(outOfOrder['companies.0.hikes.1.date'], /after the previous one/);

  const notAHike = validate(
    form({
      companies: [
        company({
          hikes: [
            { ...emptyHike(), date: '2024-03-01', salary: '60000' },
            { ...emptyHike(), date: '2024-09-01', salary: '55000' },
          ],
        }),
      ],
    }),
  );
  assert.match(notAHike['companies.0.hikes.1.salary'], /greater than the previous salary/);
});

test('salary day must be a number from 1 to 31', () => {
  assert.match(validate(form({ salaryDay: 'x' })).salaryDay, /must be a number/);
  assert.match(validate(form({ salaryDay: '0' })).salaryDay, /between 1 and 31/);
  assert.match(validate(form({ salaryDay: '32' })).salaryDay, /between 1 and 31/);
  assert.equal(validate(form({ salaryDay: '31' })).salaryDay, undefined);
});

test('IFSC must belong to the chosen bank', () => {
  const errors = validate(form({ companies: [company({ bank: 'SBIN' })] }));
  assert.match(errors['companies.0.ifsc'], /does not belong/);
});

test('payload carries the narration and numeric amounts', () => {
  const payload = toPayload(
    form({ companies: [company({ hikes: [{ ...emptyHike(), date: '2024-06-01', salary: '60000' }] })] }),
  );
  assert.equal(payload.salaryDay, 5);
  assert.equal(payload.fullAndFinalCredited, true);
  assert.equal(payload.companies[0].salary, 50000);
  assert.equal(payload.companies[0].hikes[0].salary, 60000);
  assert.equal(
    payload.companies[0].narration,
    'DEP TFR NEFT-HDFC0000032*HDFC-{{TraNum}}-SAL{{ShortMonth}}{{ShortYear}}',
  );
});
