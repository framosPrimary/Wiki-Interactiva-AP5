export type Authority = "functional" | "supplemental";

export interface Heading {
  level: number;
  text: string;
  anchor: string;
}

export interface WikiDocument {
  id: string;
  versionId: string;
  slug: string;
  sourcePath: string;
  title: string;
  module: string;
  submodule: string | null;
  documentId: string | null;
  revision: number | null;
  reviewStatus: string | null;
  content: string;
  headings: Heading[];
}

export interface NavItem {
  title: string;
  slug: string;
  documentId: string | null;
  module: string;
  submodule: string | null;
  isIndex: boolean;
}

export interface SearchHit {
  title: string;
  slug: string | null;
  documentId: string | null;
  heading: string | null;
  anchor: string | null;
  excerpt: string;
  authority: Authority;
  sourceKind: string;
  reviewStatus: string | null;
  limitations: string | null;
  sourcePath: string;
  score: number;
}

export interface Citation extends SearchHit {
  index: number;
  href: string | null;
}
