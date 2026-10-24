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
  conversationId?: number;
  messageId?: number;
  model?: string;
};

export type ConversationSummary = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number | string;
};

export type ConversationTurn = {
  id: number;
  question: string;
  answer: string;
  sources: Source[];
  verification: Verification | null;
  createdAt: string;
};

export type ConversationDetail = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  documents: DocumentMeta[];
  turns: ConversationTurn[];
};

/** Client-side thread message model (streaming-aware). */
export type ThreadMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      sources: Source[] | null;
      verification: Verification | null;
      streaming: boolean;
      error?: string;
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
