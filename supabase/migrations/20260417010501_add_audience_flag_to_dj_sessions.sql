alter table public.dj_sessions
  add column if not exists audience_flag text not null default 'all_ages';

update public.dj_sessions
set audience_flag = case event_type
  when 'Wedding Ceremony' then 'all_ages'
  when 'Wedding Reception' then 'all_ages'
  when 'Birthday Party — Kids (under 13)' then 'family_safe'
  when 'Birthday Party — Teens (13–17)' then 'teens'
  when 'Birthday Party — Adult' then 'adults_only'
  when 'Sweet 16' then 'teens'
  when 'Quinceañera' then 'all_ages'
  when 'Corporate Event' then 'all_ages'
  when 'Nightclub / Bar' then 'adults_only'
  when 'School Dance' then 'family_safe'
  when 'College Party' then 'adults_only'
  when 'Outdoor Festival' then 'all_ages'
  when 'Celebration of Life / Memorial' then 'all_ages'
  else 'all_ages'
end
where audience_flag is null or audience_flag = '';
