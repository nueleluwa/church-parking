import { SkeletonPage, SkeletonHeader, SkeletonForm, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while a vehicle loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader actions />
      <SkeletonForm fields={4} />
      <SkeletonTable rows={4} />
    </SkeletonPage>
  );
}
