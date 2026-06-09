export function computeSettlements(expenses) {
  const byCurrency = new Map();
  for (const exp of expenses) {
    if (!byCurrency.has(exp.currency)) byCurrency.set(exp.currency, []);
    byCurrency.get(exp.currency).push(exp);
  }

  const result = [];
  for (const [currency, list] of byCurrency) {
    const balance = new Map();
    const nameOf = new Map();

    const add = (key, name, delta) => {
      balance.set(key, (balance.get(key) ?? 0) + delta);
      if (name) nameOf.set(key, name);
    };

    for (const exp of list) {
      const participants = exp.participants?.length ? exp.participants : [
        { id: exp.payerId, name: exp.payerName },
      ];
      const share = exp.amount / participants.length;
      add(exp.payerId, exp.payerName, exp.amount);
      for (const p of participants) {
        add(p.id, p.name, -share);
      }
    }

    const creditors = [];
    const debtors = [];
    for (const [key, amt] of balance) {
      if (amt > 0.01) creditors.push({ key, name: nameOf.get(key) ?? key, amount: amt });
      else if (amt < -0.01) debtors.push({ key, name: nameOf.get(key) ?? key, amount: -amt });
    }
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const transfers = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].amount, creditors[j].amount);
      if (pay > 0.01) {
        transfers.push({
          from: debtors[i].name,
          to: creditors[j].name,
          amount: Math.round(pay * 100) / 100,
          currency,
        });
      }
      debtors[i].amount -= pay;
      creditors[j].amount -= pay;
      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }

    const totals = [...balance.entries()].map(([key, amt]) => ({
      name: nameOf.get(key) ?? key,
      paid: list.filter((e) => e.payerId === key).reduce((s, e) => s + e.amount, 0),
      share: list.filter((e) => e.payerId === key).reduce((s, e) => s + e.amount, 0) - amt,
    }));

    result.push({ currency, transfers, perPerson: totals, expenseCount: list.length });
  }
  return result;
}
