import type { UserRole } from "@/constants/roles";

export type RequestStatus = "open" | "in_progress" | "completed" | "rejected";
export type RequestPriority = "low" | "medium" | "high";

export interface RequestUser {
  id: string;
  username: string;
  avatar?: string;
  role: UserRole;
}

export interface RequestComment {
  id: string;
  content: string;
  author: RequestUser;
  createdAt: string;
  updatedAt?: string;
}

export interface AssetRequest {
  id: string;
  title: string;
  description: string;
  gameId: string;
  gameName: string;
  categoryId?: string;
  categoryName?: string;
  status: RequestStatus;
  priority: RequestPriority;
  upvotes: number;
  hasUpvoted?: boolean;
  submittedBy: RequestUser;
  submittedAt: string;
  updatedAt: string;
  commentCount: number;
  comments?: RequestComment[];
  referenceUrls?: string[];
  tags?: string[];
}
