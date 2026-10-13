import { SkeletonPage, SkeletonHeader, SkeletonMetrics, SkeletonTable, Block } from "@/components/ds/Skeleton";

/** Shown while the users list loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <Block className="h-12 w-full" />
      <SkeletonMetrics />
      <SkeletonTable rows={8} filters />
    </SkeletonPage>
  );
}
