import { SkeletonPage, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while the parking areas loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTable rows={4} />
    </SkeletonPage>
  );
}
