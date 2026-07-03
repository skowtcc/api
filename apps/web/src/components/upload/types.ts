interface FileMetadata {
  title: string;
  gameId: string;
  categoryId: string;
  tags: string[];
  isSuggestive: boolean;
}

export interface UploadFile {
  file: File;
  id: string;
  metadata: FileMetadata;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function generateFileId(fileName: string): string {
  return `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
