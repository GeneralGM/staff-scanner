DROP POLICY IF EXISTS "auth write departments" ON public.departments;
DROP POLICY IF EXISTS "auth read departments" ON public.departments;
DROP POLICY IF EXISTS "auth all employees" ON public.employees;
DROP POLICY IF EXISTS "auth all attendance" ON public.attendance;

CREATE POLICY "departments select" ON public.departments FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "departments insert" ON public.departments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "departments update" ON public.departments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "departments delete" ON public.departments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "employees select" ON public.employees FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "employees insert" ON public.employees FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "employees update" ON public.employees FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "employees delete" ON public.employees FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "attendance select" ON public.attendance FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "attendance insert" ON public.attendance FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "attendance update" ON public.attendance FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "attendance delete" ON public.attendance FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.create_employee(p_full_name text, p_gender smallint, p_department_code smallint)
RETURNS public.employees
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_dept public.departments;
  v_seq integer;
  v_code text;
  v_row public.employees;
BEGIN
  SELECT * INTO v_dept FROM public.departments WHERE code = p_department_code;
  IF v_dept.id IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;
  SELECT COALESCE(MAX(seq),0)+1 INTO v_seq FROM public.employees WHERE department_id = v_dept.id AND gender = p_gender;
  v_code := lpad(p_department_code::text, 2, '0') || p_gender::text || lpad(v_seq::text, 3, '0');
  INSERT INTO public.employees (employee_code, full_name, gender, department_id, seq)
    VALUES (v_code, p_full_name, p_gender, v_dept.id, v_seq) RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.scan_qr(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_emp public.employees;
  v_today date;
  v_now timestamptz := now();
  v_row public.attendance;
  v_action text;
BEGIN
  SELECT * INTO v_emp FROM public.employees WHERE employee_code = p_code;
  IF v_emp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Employee not found');
  END IF;
  v_today := (v_now AT TIME ZONE 'Africa/Cairo')::date;
  SELECT * INTO v_row FROM public.attendance WHERE employee_id = v_emp.id AND date = v_today FOR UPDATE;
  IF v_row.id IS NULL THEN
    INSERT INTO public.attendance (employee_id, date, check_in, status)
      VALUES (v_emp.id, v_today, v_now, 'present') RETURNING * INTO v_row;
    v_action := 'check_in';
  ELSIF v_row.check_in IS NULL THEN
    UPDATE public.attendance SET check_in = v_now, status='present' WHERE id = v_row.id RETURNING * INTO v_row;
    v_action := 'check_in';
  ELSIF v_row.check_out IS NULL THEN
    IF v_now - v_row.check_in < interval '10 seconds' THEN
      RETURN jsonb_build_object('ok', true, 'action', 'ignored', 'employee', to_jsonb(v_emp), 'attendance', to_jsonb(v_row));
    END IF;
    UPDATE public.attendance SET check_out = v_now WHERE id = v_row.id RETURNING * INTO v_row;
    v_action := 'check_out';
  ELSE
    IF v_now - v_row.check_out < interval '10 seconds' THEN
      RETURN jsonb_build_object('ok', true, 'action', 'ignored', 'employee', to_jsonb(v_emp), 'attendance', to_jsonb(v_row));
    END IF;
    UPDATE public.attendance SET check_out = v_now WHERE id = v_row.id RETURNING * INTO v_row;
    v_action := 'check_out_update';
  END IF;
  RETURN jsonb_build_object('ok', true, 'action', v_action, 'employee', to_jsonb(v_emp), 'attendance', to_jsonb(v_row));
END $$;

REVOKE EXECUTE ON FUNCTION public.mark_absentees() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_absentees() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_absentees() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_absentees() TO service_role;