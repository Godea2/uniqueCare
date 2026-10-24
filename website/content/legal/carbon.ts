import type { LegalSection } from "./privacy";

export const carbonInfo = {
  supplier: "Unique Care UK",
  baselineYear: "2022",
  netZeroTarget: "2030",
  publicationDate: "18 July 2022",
  pdfPath: "/documents/carbon-reduction-plan.pdf",
};

export const carbonScopes = [
  { label: "Scope 1", value: 4.62 },
  { label: "Scope 2", value: 12.565 },
  { label: "Scope 3", value: 25.68 },
];
export const carbonTotal = 42.865;

export const carbonIntroSections: LegalSection[] = [
  {
    id: "commitment-to-achieving-net-zero",
    title: "1. Commitment to Achieving Net Zero",
    blocks: [
      { type: "p", text: "Unique Care UK is resolutely committed to achieving Net Zero emissions by 2030. This determined goal underscores our dedication to environmental stewardship and sustainable business practices." },
    ],
  },
  {
    id: "baseline-year",
    title: "2. Baseline Year",
    blocks: [
      { type: "p", text: "For Unique Care UK, our baseline emissions calculations are underpinned by comprehensive energy usage data, waste management records, and business travel logs from the baseline year of 2022. We employed the GHG Protocol Corporate Accounting and Reporting Standard to ensure consistent and accurate accounting of our emissions." },
      { type: "p", text: "During the baseline year, Unique Care UK:" },
      {
        type: "list",
        items: [
          "Operated from 1 primary facility, accounting for the majority of Scope 1 and Scope 2 emissions.",
          "Employed an average of 20 staff members, whose commuting and business travel constituted our Scope 3 emissions.",
          "Engaged with 2 suppliers, factored into Scope 3 emissions through a spend-based approach, using economic data to estimate emissions indirectly associated with our operations.",
        ],
      },
      { type: "h3", text: "Adjustments for Anomalies" },
      {
        type: "list",
        items: [
          "Adjusted for an unusually cold winter resulting in higher-than-average energy consumption for heating. We used degree day correction to reflect typical weather conditions.",
          "Considered the impact of a significant portion of our fleet being upgraded to more fuel-efficient models in the latter half of the baseline year, which is expected to yield lower Scope 1 emissions in subsequent years.",
          "Excluded one-off business events that are not expected to occur annually to normalise the data.",
        ],
      },
      { type: "p", text: "These details ensure that our baseline is reflective of our operational realities and provides a solid foundation for measuring our progress towards carbon neutrality." },
    ],
  },
];

export const carbonAfterEmissionsSections: LegalSection[] = [
  {
    id: "current-emissions-reporting",
    title: "4. Current Emissions Reporting",
    blocks: [
      { type: "p", text: "As this plan was published in our baseline year, current reported emissions are the same as our baseline: Scope 1 at 4.62 tCO2e, Scope 2 at 12.565 tCO2e, and Scope 3 at 25.68 tCO2e, giving a total of 42.865 tCO2e." },
    ],
  },
  {
    id: "emissions-reduction-targets",
    title: "5. Emissions Reduction Targets",
    blocks: [
      { type: "p", text: "Unique Care UK has established the following emissions reduction targets to guide our journey to Net Zero:" },
      {
        type: "list",
        items: [
          "Short-term (within 1 year): reduce total emissions by 10%",
          "Medium-term (within 3 years): reduce total emissions by 25%",
          "Long-term (within 5 years): reduce total emissions by 50%",
        ],
      },
      { type: "p", text: "These targets align with our commitment to sustainability and our goal of significantly reducing our carbon footprint by 2030." },
    ],
  },
  {
    id: "completed-carbon-reduction-initiatives",
    title: "6. Completed Carbon Reduction Initiatives",
    blocks: [
      { type: "p", text: "Unique Care UK has actively pursued various initiatives in line with our commitment to achieving Net Zero emissions:" },
      {
        type: "list",
        items: [
          "We installed solar panels across all main facilities, now generating about 30% of our energy needs.",
          "Secured 100% of our electricity from renewable sources through a green energy contract.",
          "Upgraded to energy-efficient LED lighting, resulting in a 20% reduction in energy usage for lighting.",
          "Implemented an adaptive smart HVAC system, achieving a 15% reduction in heating and cooling energy.",
          "Instituted comprehensive recycling schemes, cutting landfill waste by 40%, and initiated a zero-waste programme, significantly reducing single-use plastics.",
          "Launched an employee sustainability awareness initiative, promoting energy conservation and sustainable commuting, including a 'cycle to work' scheme.",
          "Revised our procurement policies to favour environmentally responsible suppliers, focusing on products with lower carbon footprints and sustainable sourcing.",
        ],
      },
    ],
  },
  {
    id: "ongoing-and-planned-projects",
    title: "7. Ongoing and Planned Carbon Reduction Projects",
    blocks: [
      { type: "p", text: "Unique Care UK has been advancing towards its Net Zero emissions goal with several ongoing and planned projects:" },
      {
        type: "list",
        items: [
          "Implementing an advanced energy management system for real-time energy use optimisation across all facilities.",
          "Retrofitting older buildings with enhanced insulation, energy-efficient windows, and green roofing to lower energy consumption.",
          "Developing a supplier engagement programme focused on reducing Scope 3 emissions through sustainable practices.",
          "Investigating on-site wind energy solutions and off-site renewable energy investments to fully transition to renewable energy sources.",
          "Formulating a carbon offset strategy with investments in forestry, renewable energy, and community emission reduction projects.",
          "Promoting telecommuting and flexible work schedules, aiming to cut commuting-related emissions by 20%.",
          "Planning to transition our vehicle fleet to electric vehicles, coupled with installing charging stations at our premises.",
          "Implementing green IT initiatives, including server virtualisation and responsible electronic waste disposal.",
          "Investing in R&D for products and services to lower carbon footprints, both internally and for clients.",
          "Initiating water conservation measures to indirectly reduce carbon emissions.",
          "Planning to launch a 'green champions' programme, empowering employees in carbon reduction efforts.",
        ],
      },
      { type: "p", text: "Unique Care UK aims not just to reduce its environmental impact, but also to create long-term growth and innovation in the healthcare sector through these activities. Our journey to Net Zero is ongoing, and we are committed to continued growth and the implementation of best environmental stewardship practices." },
    ],
  },
  {
    id: "declaration-and-sign-off",
    title: "8. Declaration and Sign Off",
    blocks: [
      { type: "p", text: "This Carbon Reduction Plan has been compiled in accordance with PPN 06/21 and associated guidance, reflecting Unique Care UK's commitment to reducing its carbon footprint and contributing to global sustainability goals." },
      { type: "p", text: "Signed on behalf of the supplier, 18 July 2022. The signed copy is available as a downloadable PDF." },
    ],
  },
  {
    id: "contact",
    title: "9. Contact",
    blocks: [
      { type: "p", text: "Email: info@uniquecareuk.com · Phone: 02039170260" },
    ],
  },
];
