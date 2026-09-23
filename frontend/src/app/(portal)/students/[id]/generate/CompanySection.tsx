"use client";

import { BANKS, branchesFor, salaryNarration } from "@/lib/banks";
import type { CompanyInput, Errors, HikeInput } from "@/lib/generate-record";
import { emptyHike } from "@/lib/generate-record";
import { Button } from "@/components/Button";
import { SelectField, TextField } from "@/components/Field";

/** One employment period, with its own list of hikes. */
export function CompanySection({
  company,
  index,
  errors,
  onChange,
  onRemove,
  removable,
}: {
  company: CompanyInput;
  index: number;
  errors: Errors;
  onChange: (next: CompanyInput) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const at = (field: string) => errors[`companies.${index}.${field}`];
  const set = <K extends keyof CompanyInput>(key: K, value: CompanyInput[K]) =>
    onChange({ ...company, [key]: value });

  const setHike = (hikeIndex: number, next: HikeInput) =>
    onChange({
      ...company,
      hikes: company.hikes.map((hike, i) => (i === hikeIndex ? next : hike)),
    });

  return (
    <div className="rounded-[10px] border border-[var(--color-line)] bg-slate-50/40 px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Company {index + 1}</h3>
        {removable && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--color-danger)] hover:bg-red-50"
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Company name"
            required
            value={company.name}
            onChange={(event) => set("name", event.target.value)}
            error={at("name")}
          />
        </div>

        <TextField
          label="Joining date"
          type="date"
          required
          value={company.joiningDate}
          onChange={(event) => set("joiningDate", event.target.value)}
          error={at("joiningDate")}
        />
        <TextField
          label="Relieving date"
          type="date"
          required
          value={company.relievingDate}
          onChange={(event) => set("relievingDate", event.target.value)}
          error={at("relievingDate")}
        />

        <div className="sm:col-span-2">
          <TextField
            label="Salary"
            required
            inputMode="decimal"
            placeholder="50000"
            value={company.salary}
            onChange={(event) => set("salary", event.target.value)}
            error={at("salary")}
          />
        </div>

        <SelectField
          label="Bank"
          value={company.bank}
          // Changing bank invalidates the branch, so clear it.
          onChange={(value) => onChange({ ...company, bank: value, ifsc: "" })}
          options={[
            { value: "", label: "Select a bank" },
            ...BANKS.map((bank) => ({
              value: bank.code,
              label: `${bank.code} — ${bank.name}`,
            })),
          ]}
          error={at("bank")}
        />

        <SelectField
          label="IFSC code"
          value={company.ifsc}
          onChange={(value) => set("ifsc", value)}
          options={[
            {
              value: "",
              label: company.bank
                ? "Select an IFSC code"
                : "Select a bank first",
            },
            ...branchesFor(company.bank).map((branch) => ({
              value: branch.ifsc,
              label: `${branch.ifsc} — ${branch.city}, ${branch.branch}`,
            })),
          ]}
          error={at("ifsc")}
        />

        <div className="sm:col-span-2">
          <TextField
            label="Salary credit text"
            required
            placeholder="{{ShortMonth}} Salary Credited XYZ technologies"
            hint="{{ShortMonth}}{{ShortYear}}"
            value={company.salaryCreditText}
            onChange={(event) => set("salaryCreditText", event.target.value)}
            error={at("salaryCreditText")}
          />
          <p className="mt-2 rounded-[8px] border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-[12px] break-all text-[var(--color-ink)]">
            {salaryNarration(
              company.ifsc,
              company.bank,
              company.salaryCreditText,
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--color-line)] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[13px] font-semibold">
            Hikes{" "}
            <span className="font-normal text-[var(--color-muted)]">
              ({company.hikes.length})
            </span>
          </h4>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({ ...company, hikes: [...company.hikes, emptyHike()] })
            }
          >
            Add hike
          </Button>
        </div>

        {company.hikes.length === 0 ? (
          <p className="text-[13px] text-[var(--color-muted)]">
            No hikes added.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {company.hikes.map((hike, hikeIndex) => (
              <div
                key={hike.id}
                className="grid items-start gap-3 rounded-[8px] border border-[var(--color-line)] bg-white px-3 py-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <TextField
                  label={`Hike ${hikeIndex + 1} date`}
                  type="date"
                  value={hike.date}
                  onChange={(event) =>
                    setHike(hikeIndex, { ...hike, date: event.target.value })
                  }
                  error={at(`hikes.${hikeIndex}.date`)}
                />
                <TextField
                  label="Hike salary"
                  inputMode="decimal"
                  placeholder="60000"
                  value={hike.salary}
                  onChange={(event) =>
                    setHike(hikeIndex, { ...hike, salary: event.target.value })
                  }
                  error={at(`hikes.${hikeIndex}.salary`)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-6 text-[var(--color-danger)] hover:bg-red-50"
                  onClick={() =>
                    onChange({
                      ...company,
                      hikes: company.hikes.filter((_, i) => i !== hikeIndex),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
