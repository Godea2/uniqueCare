import PostEditor from "@/components/admin/PostEditor";

export default function EditPostPage({ params }: { params: { id: string } }) {
  return <PostEditor key={params.id} id={params.id} />;
}
