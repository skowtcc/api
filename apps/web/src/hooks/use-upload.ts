import { useState, useCallback, useRef } from "react";
import { useTRPC } from "@/utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UploadFile } from "@/components/upload/types";

type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadProgress {
  fileId: string;
  status: UploadStatus;
  progress: number; // 0-100
  error?: string;
  assetId?: string;
}

interface UseUploadOptions {
  onSuccess?: (results: UploadProgress[]) => void;
  onError?: (error: Error) => void;
}

// uses xhr instead of fetch for upload progress tracking
async function uploadToS3(
  file: File,
  uploadUrl: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload cancelled"));
    });

    xhr.open("PUT", uploadUrl);
    xhr.send(file);
  });
}

export function useUpload(options: UseUploadOptions = {}) {
  const trpc = useTRPC();
  const [progress, setProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const skipApprovalRef = useRef(false);

  // resolve tag slugs to ids at upload time
  const { data: filters } = useQuery(trpc.asset.getFilters.queryOptions());
  const slugToId = (slugs: string[]): string[] => {
    if (!filters?.tags) return [];
    return slugs.map((s) => filters.tags.find((t) => t.slug === s)?.id).filter(Boolean) as string[];
  };

  const requestUploadMutation = useMutation(trpc.uploads.requestUpload.mutationOptions());

  const commitUploadMutation = useMutation(trpc.uploads.commitUpload.mutationOptions());

  const updateProgress = useCallback((fileId: string, updates: Partial<UploadProgress>) => {
    setProgress((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(fileId) || {
        fileId,
        status: "idle" as const,
        progress: 0,
      };
      newMap.set(fileId, { ...current, ...updates });
      return newMap;
    });
  }, []);

  const uploadFile = useCallback(
    async (uploadFile: UploadFile): Promise<UploadProgress> => {
      const { file, id, metadata } = uploadFile;

      try {
        updateProgress(id, { status: "uploading", progress: 0 });

        const { assetId, uploadUrl } = await requestUploadMutation.mutateAsync({
          name: metadata.title,
          gameId: metadata.gameId,
          categoryId: metadata.categoryId,
          tagIds: slugToId(metadata.tags),
          mimeType: file.type,
          fileSize: file.size,
          isSuggestive: metadata.isSuggestive,
          skipApproval: skipApprovalRef.current,
        });

        updateProgress(id, { progress: 10, assetId });

        await uploadToS3(file, uploadUrl, (percent) => {
          // map 0-100 to 10-90 range
          const mappedProgress = 10 + Math.round(percent * 0.8);
          updateProgress(id, { progress: mappedProgress });
        });

        updateProgress(id, { progress: 95 });

        await commitUploadMutation.mutateAsync({ assetId });

        updateProgress(id, { status: "success", progress: 100 });

        return {
          fileId: id,
          status: "success",
          progress: 100,
          assetId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";
        updateProgress(id, { status: "error", error: errorMessage });

        return {
          fileId: id,
          status: "error",
          progress: 0,
          error: errorMessage,
        };
      }
    },
    [requestUploadMutation, commitUploadMutation, updateProgress],
  );

  const uploadFiles = useCallback(
    async (files: UploadFile[], opts?: { skipApproval?: boolean }) => {
      skipApprovalRef.current = opts?.skipApproval ?? false;
      setIsUploading(true);
      const results: UploadProgress[] = [];

      // upload files sequentially to avoid overwhelming the server
      for (const file of files) {
        const result = await uploadFile(file);
        results.push(result);
      }

      setIsUploading(false);

      const hasErrors = results.some((r) => r.status === "error");
      if (hasErrors) {
        options.onError?.(new Error("Some uploads failed"));
      } else {
        options.onSuccess?.(results);
      }

      return results;
    },
    [uploadFile, options],
  );

  const reset = useCallback(() => {
    setProgress(new Map());
    setIsUploading(false);
  }, []);

  const getProgress = useCallback(
    (fileId: string): UploadProgress | undefined => {
      return progress.get(fileId);
    },
    [progress],
  );

  return {
    uploadFiles,
    isUploading,
    getProgress,
    reset,
  };
}
