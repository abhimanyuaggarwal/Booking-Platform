// Money is stored in paise everywhere. Copy says "dakshina ₹500", never "fee".

export function formatRupees(paise) {
  const rupees = paise / 100;
  const digits = Number.isInteger(rupees) ? 0 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(rupees);
}
