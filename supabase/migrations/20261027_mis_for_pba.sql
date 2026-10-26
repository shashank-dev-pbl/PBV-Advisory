-- When Prime Bottomline closes the books (company master step 2), PBA staff read the MIS workbook and submit the month, so they need the
-- same rights on the workbook records and draft figures that an external practitioner has. Publishing still needs a different person
-- (the published_not_submitter constraint), and a founder gets none of this.
create policy "pba insert mis_upload" on mis_upload for insert to authenticated
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
create policy "pba delete own mis_upload" on mis_upload for delete to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
create policy "pba insert period_figures" on period_figures for insert to authenticated
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
create policy "pba update draft period_figures" on period_figures for update to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba' and state = 'draft')
  with check (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba');
create policy "pba delete draft period_figures" on period_figures for delete to authenticated
  using (company_id = (select company_id from current_app_user()) and (select role from current_app_user()) = 'pba' and state <> 'published');
