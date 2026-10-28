import NewsletterEditor from "@/components/admin/NewsletterEditor";

export default function EditNewsletterPage({ params }: { params: { id: string } }) {
  return <NewsletterEditor key={params.id} id={params.id} />;
}
