export type ClaimStatus = 'supported' | 'partial' | 'unsupported' | 'uncited' | 'unverified';

export type VerifiedClaim = {
  text: string;
  sourceLabels: string[];
  status: ClaimStatus;
};

export type Verification = {
  status: 'verified' | 'partial' | 'unsupported' | 'unverified';
  score: number;
  claims: VerifiedClaim[];
};

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
  verification: Verification | null;
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
