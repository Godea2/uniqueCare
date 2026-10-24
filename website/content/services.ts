export type Service = {
  slug: string;
  name: string;
  short: string;
  image: string;
  imageAlt: string;
  icon: string; // lucide icon key
  badge?: string;
  body: [string, string];
};

export const services: Service[] = [
  {
    slug: "domiciliary-care",
    name: "Domiciliary Care",
    short:
      "Your home is your castle. There is no better place to be cared for than the comfortable surroundings of your own home. Our comprehensive range of Home Care services ensures that you are well looked after.",
    image: "/images/domiciliary-care.jpg",
    imageAlt: "Domiciliary Care",
    icon: "home",
    badge: "Most popular",
    body: [
      "Our domiciliary care programme assists individuals of any age experiencing illness or injury that complicates daily routine management, whether you have recently been discharged from hospital, are living alone and need help with basic routines, or are caring for a sick or vulnerable family member.",
      "Our services include personal care such as hygiene, toileting, dressing and bed mobility; bathing and showering support; home-cooked meals prepared to your preferences and schedule; domestic assistance including housework, laundry, ironing, shopping, pension collection and gardening; befriending and sitting services; and escorting to medical appointments and social events.",
    ],
  },
  {
    slug: "live-in-care",
    name: "Live-in Care",
    short:
      "Live-In Care is designed for people who cannot live independently but need assistance both day and night. We can arrange a live-in carer, professionally trained to help you.",
    image: "/images/live-in-care.jpg",
    imageAlt: "Live-in Care",
    icon: "bed",
    body: [
      "Our professionally trained live-in carers help with medication administration, personal hygiene, continence care, meal preparation, shopping and household tasks. Support encompasses daily living assistance including housework, financial management, and social engagement such as visiting friends and family, hobbies and fitness activities.",
      "Your care plan is individually designed in partnership with you to provide the support you want and need, where and when you want it. We cater for individuals with physical or learning disabilities, mental health conditions, dementia, multiple sclerosis, and elderly populations, with flexible scheduling from occasional visits to round-the-clock care.",
    ],
  },
  {
    slug: "supported-living",
    name: "Supported Living",
    short:
      "Our supported living service provides support to people of all ages with physical or mental health needs, enabling them to live as independently as possible.",
    image: "/images/supported-living.jpg",
    imageAlt: "Supported Living",
    icon: "building",
    body: [
      "Unique Care UK provides a range of care packages to help service users move from hospitals or residential care homes to living independently in their own homes. We deliver individualised care designed around each person's requirements, emphasising autonomy through the provision of qualified personnel and residential support.",
      "Our services include person-centred care addressing specific client needs, housing provision, trained staff support, independence maintenance assistance, community service access facilitation, and tailored, flexible options that enable you to participate fully in community activities.",
    ],
  },
  {
    slug: "disabilities-care",
    name: "Disabilities Care",
    short:
      "We provide for a wide range of Adults with Mental Health and Learning Disabilities including ADHD, Depression, Autism, Downs Syndrome and those with Limited Mobility.",
    image: "/images/disabilities-care.jpg",
    imageAlt: "Disabilities Care",
    icon: "accessibility",
    body: [
      "Our care workers assist with morning routines including washing, showering, dressing and breakfast; medication reminders and pharmacy coordination; meal preparation and dining support; shopping assistance; laundry, ironing and household cleaning; personal grooming; and evening bedtime preparation. We support adults with various conditions including mental health issues, learning disabilities, autism, Down's syndrome, ADHD, and limited mobility ranging from zimmer frame users to bedbound individuals requiring hoist transfers.",
      "A significant part of our service focuses on social inclusion through external activities like park visits, swimming, day centre social groups, cinema outings and visits to friends, family and religious services. It's your life and your care, so it must be your way.",
    ],
  },
  {
    slug: "dementia-care",
    name: "Dementia Care",
    short:
      "High-quality home care and support to keep you safe and comfortable in your own home. Our services support you to maintain your chosen lifestyle with reliability and a friendly service.",
    image: "/images/dementia-care.jpg",
    imageAlt: "Dementia Care",
    icon: "brain",
    body: [
      "Dementia affects the brain in over 100 different forms, with Alzheimer's being increasingly diagnosed in the UK. Initial symptoms typically involve memory loss, such as forgetting names, places or plans, which leads to confusion and frustration. We believe each customer is unique, with their own individual preferences and needs, so we keep you in control and provide the care and support you want, where and when you want it.",
      "We offer flexible support across multiple care levels including hourly visiting care, 24-hour live-in care, night care, respite care and group workshops. Our dementia-trained carers provide consistent routines, memory prompts and compassionate support that help reduce confusion and maintain dignity in the place you know best.",
    ],
  },
  {
    slug: "respite-care",
    name: "Respite Care",
    short:
      "Designed to give an existing carer, such as a family member, a break from their caregiving role. Our respite care professionals will support you to the exact same standard.",
    image: "/images/respite-care.jpg",
    imageAlt: "Respite Care",
    icon: "coffee",
    body: [
      "Our respite service allows us to replace your invaluable family member for a short period of time, providing you with the same level of care and love that you expect from your family member, except this time with a professional touch. For those requiring more intensive support, we also provide 24/7 care and assistance options.",
      "Our companionship care gives you a trained professional companion available when you need them most — whether that's sharing favourite television programmes, taking walks together, preparing beverages, or simply engaging in meaningful conversation. We provide a true companion who is professionally trained and can genuinely understand your needs.",
    ],
  },
  {
    slug: "palliative-care",
    name: "Palliative Care",
    short:
      "Our End of Life care at home services can make the most difficult times a little easier to manage. We offer trained, experienced, compassionate staff who can give personalised care.",
    image: "/images/palliative-care.jpg",
    imageAlt: "Palliative Care",
    icon: "heart-handshake",
    body: [
      "Many people wish to stay at home in a familiar environment during these hard times, so we offer trained, experienced, compassionate staff who can give personalised care at home from the time of diagnosis until after death. We can support you to maintain stability in the final stages of many terminal illnesses through end-of-life care for the relief of pain, symptoms and emotional stress.",
      "Our carers respect and understand the need for trust, sensitivity, dignity and personal choice. We provide support for domestic and personal requirements, assist with medication needs and help manage symptoms where possible. We deliver care in a way that fits with people's preferences and spiritual requirements, and we support the whole family — giving practical advice and emotional care to loved ones as they go through the challenges of diagnosis, acceptance, bereavement and grief.",
    ],
  },
  {
    slug: "reablement-care",
    name: "Reablement Care",
    short:
      "Short-term support designed to help you regain independence and confidence after illness, injury, or a stay in hospital. We focus on what you can do, not what you can't.",
    image: "/images/reablement-care.jpg",
    imageAlt: "Reablement Care",
    icon: "trending-up",
    body: [
      "Reablement promotes individual independence by helping you regain or retain your confidence and skills so that you can manage on your own again after a period of illness, in the comfort of your own home. The service is short-term, lasting a maximum of six weeks, with the length depending on how quickly you can manage independently.",
      "Our carers support you with personal care including washing, showering and bathing; getting dressed and undressed; toileting and promoting continence; meal preparation and serving; taking medication including prompting, assisting and administering; mobility support; and getting into and out of bed or a chair.",
    ],
  },
];

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}

/** "Other Services" sidebar rule from the brief. */
export function otherServices(current: string): Service[] {
  const pick = (slugs: string[]) => slugs.map((s) => services.find((x) => x.slug === s)!) as Service[];
  if (current === "domiciliary-care") return pick(["live-in-care", "supported-living", "disabilities-care"]);
  if (current === "live-in-care") return pick(["domiciliary-care", "supported-living", "disabilities-care"]);
  if (current === "supported-living") return pick(["domiciliary-care", "live-in-care", "disabilities-care"]);
  return pick(["domiciliary-care", "live-in-care", "supported-living"]);
}
