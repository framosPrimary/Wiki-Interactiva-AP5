import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentView } from "@/components/DocumentView";
import { documentBySlug } from "@/lib/content";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const document = await documentBySlug(slug.join("/"));
  return { title: document?.title || "Documento" };
}

export default async function DocumentPage({ params }: Props) {
  const { slug } = await params;
  const document = await documentBySlug(slug.join("/"));
  if (!document) notFound();
  return <DocumentView document={document} />;
}
