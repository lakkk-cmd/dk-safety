-- Make issued warranties immutable (archive-grade)

create or replace function public.prevent_warranty_mutation()
returns trigger as $$
begin
  raise exception 'ISSUED_WARRANTY_IMMUTABLE';
end;
$$ language plpgsql;

drop trigger if exists trg_warranties_no_update on public.warranties;
create trigger trg_warranties_no_update
before update on public.warranties
for each row
execute function public.prevent_warranty_mutation();

drop trigger if exists trg_warranties_no_delete on public.warranties;
create trigger trg_warranties_no_delete
before delete on public.warranties
for each row
execute function public.prevent_warranty_mutation();
