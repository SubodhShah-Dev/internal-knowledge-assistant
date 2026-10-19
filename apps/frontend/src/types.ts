export type Source = {
  label: string;
  documentId: string;
  title: string;
  chunkIndex: number;
  excerpt: string;
};

export type AskResponse = {
  answer: string;
  sources: Source[];
};

export type DocumentMeta = {
  id: string;
  title: string;
  original_name: string;
  byte_size: number;
  created_at: string;
};

export type AuthResponse = {
  user: { id: string; email: string; role: string };
  token: string;
};
