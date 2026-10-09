-- The only starting data production needs: the three car parks and the three Sunday services (docs/spec.md, section 3).
-- Safe to run again: nothing is added if it is already there. No people, cars or visits, ever.
-- Names and times can be changed afterwards by an admin in the app (Car Parks, Services).
insert into areas (name, slug, sort)
select v.name, v.slug, v.sort
from (values ('Car Park 1', 'cp1', 1), ('Car Park 2', 'cp2', 2), ('Roadside', 'road', 3)) as v(name, slug, sort)
where not exists (select 1 from areas);

insert into services (name, weekday, starts_at, ends_at)
select v.name, 0, v.starts_at::time, v.ends_at::time
from (values ('Service 1', '07:30', '09:30'), ('Service 2', '09:30', '11:30'), ('Service 3', '11:30', '13:30')) as v(name, starts_at, ends_at)
where not exists (select 1 from services);
