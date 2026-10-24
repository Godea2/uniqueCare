export const site = {
  name: "Unique Care UK",
  legalName: "Unique Resourcing Ltd",
  vat: "285 7129 71",
  founded: 2017,
  url: "https://uniquecareuk.com",
  phonePrimary: "02039170260", // display as 020 3917 0260, tel:+442039170260
  phonePrimaryDisplay: "020 3917 0260",
  phonePrimaryTel: "tel:+442039170260",
  phoneMobile: "07958367038", // display as 07958 367038, tel:+447958367038
  phoneMobileDisplay: "07958 367038",
  phoneMobileTel: "tel:+447958367038",
  whatsapp: "https://wa.me/447958367038",
  email: "info@uniquecareuk.com",
  hours: "Mon–Fri: 9am–5pm | Sat–Sun: 24-hour services",
  offices: [
    { name: "London Branch", address: "280 Mare Street, Hackney, London E8 1HE" },
    { name: "Hertfordshire Branch", address: "Suite 3, Phoenix House, 63 Campfield Rd, St Albans AL1 5FL" },
  ],
  footerLocation: "London & Essex",
  cqcReportUrl: "https://www.cqc.org.uk/location/1-6980495983?referer=widget3",
  cqcRating: "Good",
  social: {
    facebook: "https://www.facebook.com/profile.php?id=100070078392760",
    instagram: "https://www.instagram.com/unique_care_united_kingdom",
    linkedin: "https://www.linkedin.com/company/uniqueresourcinglimited/about/",
  },
  areas: ["London", "Essex", "Hertfordshire"],
} as const;

export const yearsOfCare = new Date().getFullYear() - site.founded;

export const adminPortalUrl = process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ?? "";
