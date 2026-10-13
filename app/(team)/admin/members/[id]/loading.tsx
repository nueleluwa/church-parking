import { SkeletonPage, SkeletonHeader, SkeletonForm, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while a member loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonForm fields={3} />
        <div className="lg:col-span-2">
          <SkeletonTable rows={5} />
        </div>
      </div>
    </SkeletonPage>
  );
}
