/**
 * IDBI-format transaction generator: the same salary periods the SBI module
 * walks, emitted as { date, details, type, amount, balance } rows.
 */
const DEFAULT_BANK_CODES = [
  "ICIN",
  "PUNBH",
  "HDFCB",
  "IDBI",
  "SBIN",
  "CNRB",
  "UTIB",
  "YESB",
  "IDFC",
];

const DEFAULT_NUMBER_OF_CREDITS_TRANSACTIONS = [1, 3];
const DEFAULT_NUMBER_OF_DEBITS_TRANSACTIONS = [15, 20];
const DEFAULT_BALANCE_BEFORE_FROM_DATE = 5122.96;
const DEFAULT_BALANCE_AFTER_TO_DATE = 453.0;
const DEFAULT_SALARY_DAY = 5;
const DEFAULT_NEXT_WORKING_DAY = false;

function formatTransactionDate(date) {
  return date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

function parseDateTime(dateStr) {
  const [datePart, timePart = "00:00:00"] = dateStr.trim().split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute, second);
}

function checkDateOrder(transactions) {
  const invalidDates = [];

  for (let index = 1; index < transactions.length; index += 1) {
    const prevDate = parseDateTime(transactions[index - 1].date);
    const currDate = parseDateTime(transactions[index].date);

    if (currDate < prevDate) {
      invalidDates.push({
        index,
        date: transactions[index].date,
        prevDate: transactions[index - 1].date,
      });
    }
  }

  return invalidDates;
}

function generateSampleTransactions(count = 1000) {
  const merchants = [
    "D Mart Tirupati",
    "More Supermarket",
    "Reliance Fresh",
    "Vani Cool Drinks",
    "Sri Venkateswara Filling Station",
    "Nandini Sweets",
    "A2B Restaurant",
    "Minerva Coffee Shop",
    "KFC Tirupati",
    "Dominos Tirupati",
    "Apollo Pharmacy",
    "MedPlus Pharmacy",
    "Jio Recharge",
    "Airtel Recharge",
    "BSNL Recharge",
    "Swiggy",
    "Zomato",
    "BigBasket",
    "Oormila G",
    "E Dileep Kumar",
    "Mr Venkatesh Ravi Varma",
    "Sai Teja",
    "Srinivasulu Reddy",
    "Lakshmi Narayana",
    "Anjaneya Stores",
    "Balaji Medicals",
    "Sri Balaji Traders",
    "Rythu Bazaar Tirupati",
    "Chandra Peta ATM",
    "Vijaya Dairy",
  ];

  const names = [
    "GOLLAPALLI CHANDRAMOULI REDDY",
    "G JANARDHAN REDDY",
    "SAI TEJA REDDY",
    "VENKATA RAMANA REDDY",
    "SREENIVASULU REDDY",
    "PAVAN KUMAR REDDY",
    "MADHUSUDHAN REDDY",
    "RAVI KUMAR REDDY",
    "NAVEEN KUMAR REDDY",
    "LOKESH REDDY",
    "DILEEP KUMAR REDDY",
    "MAHESH REDDY",
    "KIRAN KUMAR REDDY",
    "HARISH REDDY",
    "ANIL KUMAR REDDY",
    "PRAVEEN REDDY",
    "SURESH BABU REDDY",
    "RAJASEKHAR REDDY",
    "RAMANA REDDY",
    "NARASIMHA REDDY",
    "BALAJI REDDY",
    "VENKATESH REDDY",
    "GURAVA REDDY",
    "MUNI REDDY",
    "PEDDIREDDY PRASAD",
    "KETHIREDDY NARESH",
    "PASUPULETI SRINIVAS",
    "CHENNURU SURESH",
    "KONDURU VENKATESH",
    "NALLARI RAMESH",
    "BHUMA NAGI REDDY",
    "MADDILETI REDDY",
    "SAI KRISHNA REDDY",
    "SAI CHARAN REDDY",
    "SAI KIRAN REDDY",
    "SAI PRASAD REDDY",
    "SAI KUMAR REDDY",
    "SAI VENKAT REDDY",
    "SAI GANESH REDDY",
    "VENKATA SAI REDDY",
    "SRINIVASA RAO",
    "VENKATA RAO",
    "RAMA RAO",
    "KRISHNA RAO",
    "SATYANARAYANA RAO",
    "ANJANEYA RAO",
    "RAMESH RAO",
    "NAGESWARA RAO",
    "KOTESWARA RAO",
    "SAMBASIVA RAO",
    "VENKATESWARA RAO",
    "CHANDRASEKHAR RAO",
    "SIVA PRASAD RAO",
    "NARAYANA RAO",
    "GOPALA KRISHNA RAO",
    "VENKATA NARAYANA",
    "SRIKANTH NAIDU",
    "RAJESH NAIDU",
    "VENKATESH NAIDU",
    "CHANDRA NAIDU",
    "HARI KRISHNA NAIDU",
    "RAMBABU NAIDU",
    "BALAJI NAIDU",
    "PAVAN NAIDU",
    "LOKESH NAIDU",
    "SRIDHAR NAIDU",
    "MANOJ NAIDU",
    "JAGADEESH NAIDU",
    "CHANDRASEKHAR NAIDU",
    "MUNI KRISHNA NAIDU",
    "VENKATA RAMANA NAIDU",
    "ANAND KUMAR",
    "RAVI KUMAR",
    "DILEEP KUMAR",
    "SURESH KUMAR",
    "MAHESH KUMAR",
    "PAVAN KUMAR",
    "NAVEEN KUMAR",
    "LOKESH KUMAR",
    "PRAVEEN KUMAR",
    "RAMESH KUMAR",
    "SANTOSH KUMAR",
    "ASHOK KUMAR",
    "ANIL KUMAR",
    "KIRAN KUMAR",
    "ARUN KUMAR",
    "GANESH KUMAR",
    "MADHU KUMAR",
    "VIJAY KUMAR",
    "RAJ KUMAR",
    "HARI KUMAR",
    "VENKATESH VARMA",
    "RAVI VARMA",
    "KRISHNA VARMA",
    "ANIL VARMA",
    "PAVAN VARMA",
    "SAI VARMA",
    "RAM VARMA",
    "LOKESH VARMA",
    "PRASAD VARMA",
    "VENKAT VARMA",
    "SIVA KUMAR",
    "SIVA PRASAD",
    "SIVA RAMA KRISHNA",
    "SIVA NARAYANA",
    "SIVA REDDY",
    "SIVA SANKAR",
    "SIVA TEJA",
    "SIVA CHARAN",
    "SIVA KIRAN",
    "SIVA GANESH",
    "LAKSHMI DEVI",
    "PADMAVATHI",
    "SRAVANI REDDY",
    "ANUSHA REDDY",
    "KEERTHI REDDY",
    "BHAVANI REDDY",
    "MADHAVI REDDY",
    "SWATHI REDDY",
    "SINDHU REDDY",
    "DEEPTHI REDDY",
    "SOWJANYA REDDY",
    "HIMA BINDU",
    "NAVYA SRI",
    "PRAVALLIKA",
    "SUSHMITHA",
    "TEJASWINI",
    "DIVYA SRI",
    "HARIKA",
    "AKHILA",
    "BHARGAVI",
    "DURGA PRASAD",
    "ANJANEYULU",
    "SUBBA RAO",
    "VENKATA SUBBAIAH",
    "RAMACHANDRAIAH",
    "PEDDA VENKATARAMANA",
    "CHINNA VENKATARAMANA",
    "OBUL REDDY",
    "NAGA REDDY",
    "GOPAL REDDY",
    "KRISHNA REDDY",
    "RAMAKRISHNA REDDY",
    "NARAYANA REDDY",
    "JAGAN REDDY",
    "PRATAP REDDY",
    "VENKATA REDDY",
    "CHANDRA REDDY",
    "MALLIKARJUNA REDDY",
    "NAGARAJU",
    "VENKATARAMANA",
    "SRINIVASA RAJU",
    "VENKATA RAJU",
    "CHANDRASEKHAR",
    "RAMAKRISHNA",
    "SATISH BABU",
    "MURALI KRISHNA",
    "JAGADEESH",
    "PRASANNA KUMAR",
    "YUGANDHAR",
    "RAGHUNATH",
    "SUDHAKAR",
    "RAMESH BABU",
    "KISHORE BABU",
    "RAVI BABU",
    "NAGA BABU",
    "PRABHAKAR",
    "VENKATA KRISHNA",
    "SRIHARI",
    "HARINATH",
    "VISWANATH",
    "VENUGOPAL",
    "RADHA KRISHNA",
    "KALYAN CHAKRAVARTHI",
    "NARASIMHA RAO",
    "VISHNU VARDHAN",
    "KRANTHI KUMAR",
    "PHANI KUMAR",
    "MOHAN KRISHNA",
    "SATYA PRAKASH",
    "VENKATA SATYA",
    "SURYA PRAKASH",
    "ADITYA REDDY",
    "ABHISHEK REDDY",
    "KARTHIK REDDY",
    "NIKHIL REDDY",
    "MANIKANTA",
    "YASWANTH REDDY",
    "SAI MANIKANTA",
    "HEMANTH REDDY",
    "ROHITH REDDY",
    "VAMSI KRISHNA",
    "VAMSI REDDY",
    "CHAITANYA REDDY",
    "TEJA REDDY",
    "GANESH REDDY",
    "ARAVIND REDDY",
    "JYOTHI REDDY",
    "SUNEETHA REDDY",
    "SANDHYA REDDY",
    "RAMYA REDDY",
    "KAVYA REDDY",
    "PRIYANKA REDDY",
    "GEETHA REDDY",
    "SUJATHA REDDY",
    "HEMA REDDY",
    "VASANTHA REDDY",
  ];

  const types = [
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "UPI",
    "NEFT",
    "IMPS",
  ];

  const usedIds = new Set();

  function generateTxnNumber(length = 12) {
    let id;

    do {
      id = Array.from({ length }, () => Math.floor(Math.random() * 10)).join(
        "",
      );
    } while (usedIds.has(id));

    usedIds.add(id);

    return id;
  }

  return Array.from({ length: count }, () => {
    const type = types[Math.floor(Math.random() * types.length)];
    const txnNumber = generateTxnNumber();
    const beneficiaries = [...merchants, ...names];
    const beneficiary =
      beneficiaries[Math.floor(Math.random() * beneficiaries.length)];

    if (type === "UPI") {
      return `UPI/${txnNumber}/${beneficiary}`;
    }

    if (type === "NEFT") {
      return `NEFT-IN${txnNumber}-${beneficiary.toUpperCase()}`;
    }

    return `IMPS-${txnNumber}-${beneficiary.toUpperCase()}`;
  });
}

function generateIdbiTransactions(options = {}) {
  const {
    accountInfo = {},
    numberOfCreditsTransactions = DEFAULT_NUMBER_OF_CREDITS_TRANSACTIONS,
    numberOfDebitsTransactions = DEFAULT_NUMBER_OF_DEBITS_TRANSACTIONS,
    balanceBeforeFromDate:
      balanceBeforeFromDateInput = DEFAULT_BALANCE_BEFORE_FROM_DATE,
    balanceAfterToDate: balanceAfterToDateInput = DEFAULT_BALANCE_AFTER_TO_DATE,
    salaryDay = DEFAULT_SALARY_DAY,
    nextWorkingDay = DEFAULT_NEXT_WORKING_DAY,
    salaries = [],
    bank = DEFAULT_BANK_CODES,
  } = options;

  // An edited extract can carry the balances as text.
  const balanceBeforeFromDate = Number.parseFloat(balanceBeforeFromDateInput);
  const balanceAfterToDate = Number.parseFloat(balanceAfterToDateInput);

  const sampleTransactions = generateSampleTransactions();

  const atmDebits = [
    "ATM WDL-ATM CASH 51012 JEEDIMETLA Secunderabad-",
    "ATM WDL-ATM CASH 91816 THRRGALAGUTTAPALLI KARKARIMNAGAR-",
    "ATM WDL-ATM CASH 34 +ATM/JANATHAIALLI BANGALORE",
    "ATM WDL-ATM CASH 82911 +OUTHBULLAPUR BR HYDERABAD-",
    "ATM WDL-ATM CASH 8069 SBH SANJIVAREDDYNAGA HYDERABAD-",
    "ATM WDL-ATM CASH 81551 +SR NAGAR OATM HYDERABAD-",
    "ATM WDL-ATM CASH 82011+BAPU NAGAR HYDERABAD",
    "ATM WDL-ATM CASH 134 SBH SANJIVAREDDYNAGA HYDERABAD-",
    "ATM WDL-ATM CASH 6131 MOTH NAGAR 2HYDERABAD-",
    "ATM WDL-ATM CASH 1507 OPP RAILWAY STATION KACHUGUDA-",
    "ATM WDL-ATMCASH 7154 SBI SAMU/VAREDDYNAGA HYDERABAD-",
    "ATM WDL-ATM CASH 82632 +BJP OFFICE ROAD HYDERABAD-",
  ];

  function getWorkingDay(year, month, day = null, useNextWorkingDay = false) {
    let selectedDate;

    if (day === null) {
      const lastDay = new Date(year, month + 1, 0);
      const lastDayOfWeek = lastDay.getDay();

      if (lastDayOfWeek === 0) {
        lastDay.setDate(lastDay.getDate() - 2);
      } else if (lastDayOfWeek === 6) {
        lastDay.setDate(lastDay.getDate() - 1);
      }

      selectedDate = lastDay;
    } else {
      selectedDate = new Date(year, month, day);
      const dayOfWeek = selectedDate.getDay();

      if (useNextWorkingDay) {
        if (dayOfWeek === 0) {
          selectedDate.setDate(selectedDate.getDate() + 1);
        } else if (dayOfWeek === 6) {
          selectedDate.setDate(selectedDate.getDate() + 2);
        }
      } else if (dayOfWeek === 0) {
        selectedDate.setDate(selectedDate.getDate() - 2);
      } else if (dayOfWeek === 6) {
        selectedDate.setDate(selectedDate.getDate() - 1);
      }
    }

    const hours = [15, 16, 17, 18, 19, 20, 21, 22];
    const hour = hours[Math.floor(Math.random() * hours.length)];
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);

    selectedDate.setHours(hour, minute, second, 0);

    return selectedDate;
  }

  function getRandomDate(year, month, maxDate) {
    const endDate = maxDate || new Date(year, month + 1, 0).getDate();
    const randomDay = Math.floor(Math.random() * endDate) + 1;
    const hour = Math.floor(Math.random() * 16) + 7;
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);

    return new Date(year, month, randomDay, hour, minute, second);
  }

  function generateDebitAmount() {
    const rand = Math.random();
    let amount;

    if (rand < 0.1) {
      amount = Math.floor(Math.random() * (200 - 10 + 1)) + 25;
    } else if (rand < 0.4) {
      amount = Math.floor(Math.random() * (1000 - 200 + 1)) + 200;
    } else if (rand < 0.7) {
      amount = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
    } else if (rand < 0.9) {
      amount = Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000;
    } else if (rand < 0.95) {
      amount =
        Math.floor(Math.random() * ((20000 - 8000) / 100 + 1)) * 100 + 8000;
    } else {
      amount =
        Math.floor(Math.random() * ((50000 - 20000) / 100 + 1)) * 100 + 20000;
    }

    return amount.toFixed(2);
  }

  function buildSalaryDetails(salary, shortMonthName, shortYear) {
    if (!salary.text) {
      return sampleTransactions[
        Math.floor(Math.random() * sampleTransactions.length)
      ];
    }

    return salary.text
      .replace("{{BankCode}}", salary.bankCode || bank[0] || "")
      .replace(
        "{{TraNum}}",
        `${shortYear}${Math.floor(100000000 + Math.random() * 900000000)}`,
      )
      .replace("{{ShortMonth}}", shortMonthName)
      .replace("{{ShortYear}}", shortYear);
  }

  function generateTransactions(year, month, balance, toDate, salary) {
    const transactions = [];
    const minCredits = numberOfCreditsTransactions[0];
    const maxCredits = numberOfCreditsTransactions[1];
    const minDebits = numberOfDebitsTransactions[0];
    const maxDebits = numberOfDebitsTransactions[1];

    const numCredits =
      Math.floor(Math.random() * (maxCredits - minCredits + 1)) + minCredits;

    for (let index = 0; index < numCredits; index += 1) {
      const details =
        sampleTransactions[
          Math.floor(Math.random() * sampleTransactions.length)
        ];
      const creditDate = getRandomDate(year, month, toDate?.getDate());
      const creditAmount = (Math.floor(Math.random() * 801) + 200).toFixed(2);

      transactions.push({
        date: formatTransactionDate(creditDate),
        details,
        type: "Cr",
        amount: creditAmount,
      });

      balance += Number.parseFloat(creditAmount);
    }

    const numDebits =
      Math.floor(Math.random() * (maxDebits - minDebits + 1)) + minDebits;
    const debitTransactions = [];
    const usedAmounts = new Set();
    const specialIndex = Math.floor(Math.random() * numDebits);

    for (let index = 0; index < numDebits; index += 1) {
      const debitDate = getRandomDate(year, month, toDate?.getDate());

      if (index === specialIndex) {
        const atmTrans =
          atmDebits[Math.floor(Math.random() * atmDebits.length)];
        const amounts = [
          "10000.00",
          "12000.00",
          "14000.00",
          "16000.00",
          "18000.00",
          "20000.00",
          "22000.00",
          "25000.00",
        ];
        const randomAmount =
          amounts[Math.floor(Math.random() * amounts.length)];

        debitTransactions.push({
          date: formatTransactionDate(debitDate),
          details: atmTrans,
          type: "Dr",
          amount: randomAmount,
        });
        continue;
      }

      let debitAmount;
      let attempts = 0;

      do {
        debitAmount = generateDebitAmount();
        attempts += 1;

        if (attempts > 5) {
          break;
        }
      } while (usedAmounts.has(debitAmount));

      usedAmounts.add(debitAmount);

      debitTransactions.push({
        date: formatTransactionDate(debitDate),
        details:
          sampleTransactions[
            Math.floor(Math.random() * sampleTransactions.length)
          ],
        type: "Dr",
        amount: debitAmount,
      });
    }

    transactions.push(...debitTransactions);

    debitTransactions.forEach((transaction) => {
      balance -= Number.parseFloat(transaction.amount);
    });

    // A custom last-month salary carries its own exact credit date.
    const salaryDate = salary.creditDate
      ? new Date(...salary.creditDate.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0)))
      : getWorkingDay(year, month, salaryDay, nextWorkingDay);
    let displayDate = salaryDate;

    if (salaryDay) {
      displayDate = new Date(salaryDate);
      displayDate.setMonth(salaryDate.getMonth() - 1);
    }

    const shortMonthName = displayDate.toLocaleString("en-GB", {
      month: "short",
    });
    const shortYear = displayDate.getFullYear().toString().slice(-2);

    if (!toDate || salaryDate <= toDate) {
      const salaryAmount =
        salary.amount ||
        `${Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000}.00`;

      transactions.push({
        date: formatTransactionDate(salaryDate),
        details: buildSalaryDetails(salary, shortMonthName, shortYear),
        isSalary: Boolean(salary.text),
        type: "Cr",
        amount: salaryAmount,
      });

      balance += Number.parseFloat(salaryAmount);
    }

    const interestMonths = [2, 5, 8, 11];

    if (interestMonths.includes(month)) {
      const interestBaseDate = new Date(year, month, 25);

      if (!toDate || interestBaseDate <= toDate) {
        const interestAmount = (Math.random() * 300 + 100).toFixed(2);

        transactions.push({
          date: formatTransactionDate(interestBaseDate),
          details: "CREDIT INTEREST--",
          type: "Cr",
          amount: interestAmount,
        });

        balance += Number.parseFloat(interestAmount);
      }
    }

    transactions.sort((first, second) => {
      return parseDateTime(first.date) - parseDateTime(second.date);
    });

    return { transactions, balance };
  }

  function calculateBalance(transactions, initialBalance) {
    let balance = initialBalance;
    const validTransactions = [];

    for (const transaction of transactions) {
      let updatedBalance = balance;

      if (transaction.type === "Cr") {
        updatedBalance += Number.parseFloat(transaction.amount || 0);
      } else if (transaction.type === "Dr") {
        updatedBalance -= Number.parseFloat(transaction.amount || 0);
      }

      if (updatedBalance >= 0) {
        balance = updatedBalance;
        validTransactions.push({
          ...transaction,
          balance: balance.toFixed(2),
        });
      }
    }

    return validTransactions;
  }

  function generateTransactionsForDateRange(
    fromDate,
    toDate,
    initialBalance,
    targetBalance,
    salary,
  ) {
    let balance = initialBalance;
    const allTransactions = [];
    const currentDate = new Date(fromDate);

    while (currentDate <= toDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const isLastMonth =
        currentDate.getFullYear() === toDate.getFullYear() &&
        currentDate.getMonth() === toDate.getMonth();

      const { transactions, balance: updatedBalance } = generateTransactions(
        year,
        month,
        balance,
        isLastMonth ? toDate : null,
        salary,
      );

      allTransactions.push(...transactions);
      balance = updatedBalance;
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    allTransactions.sort((first, second) => {
      return parseDateTime(first.date) - parseDateTime(second.date);
    });

    const transactionsWithBalance = calculateBalance(
      allTransactions,
      initialBalance,
    );

    if (targetBalance !== undefined && transactionsWithBalance.length > 0) {
      const finalBalance = Number.parseFloat(
        transactionsWithBalance[transactionsWithBalance.length - 1].balance,
      );
      const difference = targetBalance - finalBalance;

      if (difference !== 0) {
        // A second after the last row, so the sort below keeps it last and
        // its balance stays the closing one. `toDate` itself is midnight UTC,
        // which would sort it ahead of that day's later rows.
        const lastDate = parseDateTime(
          transactionsWithBalance[transactionsWithBalance.length - 1].date,
        );
        transactionsWithBalance.push({
          date: formatTransactionDate(new Date(lastDate.getTime() + 1000)),
          details:
            sampleTransactions[
              Math.floor(Math.random() * sampleTransactions.length)
            ],
          type: difference > 0 ? "Cr" : "Dr",
          amount: Math.abs(difference).toFixed(2),
          balance: targetBalance.toFixed(2),
        });
      }
    }

    transactionsWithBalance.sort((first, second) => {
      return parseDateTime(first.date) - parseDateTime(second.date);
    });

    return transactionsWithBalance;
  }

  const salaryPeriods = salaries.length > 0 ? salaries : [];

  let allTransactions = [];
  let currentBalance = balanceBeforeFromDate;

  salaryPeriods.forEach((salary, index) => {
    const fromDate = new Date(salary.from);
    const toDate = new Date(salary.to);

    const transactions = generateTransactionsForDateRange(
      fromDate,
      toDate,
      currentBalance,
      index === salaryPeriods.length - 1 ? balanceAfterToDate : undefined,
      salary,
    );

    if (transactions.length > 0) {
      allTransactions = allTransactions.concat(transactions);
      currentBalance = Number.parseFloat(
        transactions[transactions.length - 1].balance,
      );
    }
  });

  const salaryTrans = [];

  allTransactions.forEach((transaction) => {
    if (transaction.isSalary) {
      salaryTrans.push(
        `${transaction.date}: ${transaction.amount} - ${transaction.details}`,
      );
    }
  });

  const invalidDates = checkDateOrder(allTransactions);

  return {
    salaryTrans,
    invalidDates,
    accountInfo,
    transactions: allTransactions,
  };
}

export { generateIdbiTransactions };
