import { SkeletonPage, SkeletonHeader, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while the sweep history loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <SkeletonTable rows={8} filters />
    </SkeletonPage>
  );
}
