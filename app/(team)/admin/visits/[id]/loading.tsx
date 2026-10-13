import { SkeletonPage, SkeletonHeader, SkeletonForm, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while a visit loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <SkeletonForm fields={2} />
      <SkeletonTable rows={4} />
    </SkeletonPage>
  );
}
