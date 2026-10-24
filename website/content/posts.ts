export type Post = {
  slug: string;
  category: "Care Advice" | "Company News";
  date: string; // ISO
  dateShort: string; // "10 Mar 2026"
  dateLong: string; // "10 March 2026"
  title: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  body: string[];
};

export const posts: Post[] = [
  {
    slug: "understanding-domiciliary-care",
    category: "Care Advice",
    date: "2026-03-10",
    dateShort: "10 Mar 2026",
    dateLong: "10 March 2026",
    title: "Understanding Domiciliary Care: A Complete Guide",
    excerpt:
      "Everything you need to know about home care services, what to expect, and how to arrange care for yourself or a loved one.",
    image: "/images/blog-1.jpg",
    imageAlt: "Understanding Domiciliary Care: A Complete Guide",
    body: [
      "Domiciliary care, also known as home care, is professional care and support delivered in your own home. It covers a wide range of services, from help with daily tasks like washing, dressing, and meal preparation to more complex needs such as medication management and mobility assistance.",
      "Choosing domiciliary care means you or your loved one can continue living in familiar surroundings while receiving the support needed to stay safe, comfortable, and independent. Unlike residential care, home care is tailored entirely around the individual, their routines, their preferences, and their pace.",
      "At Unique Care UK, our domiciliary care service begins with a free, no-obligation assessment. One of our experienced assessors visits you at home to understand your needs, preferences, and goals. From there, we create a personalised care plan and match you with a care worker who is the right fit.",
      "Our team is fully trained, DBS-checked, and supervised to the highest standards. As an ISO 9001 and ISO 45001 certified provider, we ensure every visit meets independently verified quality and safety benchmarks.",
      "If you are considering home care for yourself or a family member, we encourage you to get in touch. We are happy to answer any questions and guide you through the process.",
    ],
  },
  {
    slug: "why-choose-home-care",
    category: "Care Advice",
    date: "2026-03-05",
    dateShort: "5 Mar 2026",
    dateLong: "5 March 2026",
    title: "Why Choose Home Care Over Residential Care?",
    excerpt: "Explore the benefits of receiving professional care in the comfort and familiarity of your own home.",
    image: "/images/blog-2.jpg",
    imageAlt: "Why Choose Home Care Over Residential Care?",
    body: [
      "When the time comes to arrange care for yourself or a loved one, one of the biggest decisions is whether to opt for residential care or home care. Both have their place, but for many people, receiving care at home offers significant advantages.",
      "Staying at home means staying in control. You keep your routines, your possessions, your neighbours, and your independence. There is no need to adjust to a new environment or share living spaces with strangers. Home care works around your life, not the other way around.",
      "Home care is also highly flexible. Whether you need a short daily visit, several hours of support, or round-the-clock live-in care, the service can be scaled to match your exact needs. As those needs change over time, your care plan adapts with you.",
      "Research consistently shows that people recover faster and maintain better mental wellbeing when they remain in their own home. Familiar surroundings reduce confusion and anxiety, which is especially important for those living with dementia or cognitive decline.",
      "At Unique Care UK, we believe everyone deserves the choice to stay at home. Our team is dedicated to making that possible with professional, compassionate, and reliable care, backed by our CQC \"Good\" rating and dual ISO certification.",
    ],
  },
  {
    slug: "unique-care-iso-certification",
    category: "Company News",
    date: "2026-02-20",
    dateShort: "20 Feb 2026",
    dateLong: "20 February 2026",
    title: "Unique Care UK Achieves ISO 9001 & ISO 45001 Certification",
    excerpt: "We are proud to announce our dual ISO certification, reinforcing our commitment to quality and safety.",
    image: "/images/blog-3.jpg",
    imageAlt: "Unique Care UK Achieves ISO 9001 & ISO 45001 Certification",
    body: [
      "We are delighted to share that Unique Care UK has achieved both ISO 9001 (Quality Management) and ISO 45001 (Occupational Health and Safety) certification. This is a significant milestone for our organisation and a testament to the hard work of our entire team.",
      "ISO 9001 certification demonstrates that our quality management systems meet internationally recognised standards. It means every process, from care planning to staff training to complaint resolution, is documented, monitored, and continuously improved.",
      "ISO 45001 certification confirms that we have robust systems in place to protect the health and safety of our care workers, our clients, and everyone who interacts with our services. In an industry where safety is paramount, this certification provides an extra layer of assurance.",
      "These certifications set us apart in the home care sector. While many providers rely solely on CQC registration, we have chosen to go further by subjecting our operations to independent, international scrutiny.",
      "For our clients and their families, this means greater confidence that the care you receive is delivered to the highest possible standards. For our staff, it means a safer, more supportive working environment.",
      "We would like to thank our team for their dedication in achieving this milestone. Quality and safety are not destinations. They are ongoing commitments, and we will continue to raise the bar.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function relatedPosts(slug: string): Post[] {
  return posts.filter((p) => p.slug !== slug);
}

export function readingTime(p: Post): number {
  const words = p.body.join(" ").split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
