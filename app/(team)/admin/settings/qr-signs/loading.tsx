import { SkeletonPage, SkeletonCards } from "@/components/ds/Skeleton";

/** Shown while the QR signs loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonCards count={3} cols="sm:grid-cols-2 xl:grid-cols-3" />
    </SkeletonPage>
  );
}
