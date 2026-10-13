import { SkeletonPage, SkeletonHeader, SkeletonMetrics, SkeletonCards, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while the dashboard loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader actions />
      <SkeletonMetrics />
      <SkeletonCards />
      <SkeletonTable rows={5} />
    </SkeletonPage>
  );
}
