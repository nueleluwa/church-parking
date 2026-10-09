import { SearchBox } from "./SearchBox";

export default function SearchPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Find car</h1>
      <p className="text-ink-soft">
        For drivers with no pass. Ask for their name and phone number without reading them out first.
      </p>
      <SearchBox />
    </>
  );
}
