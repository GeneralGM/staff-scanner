
-- Departments
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code smallint NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write departments" ON public.departments FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.departments (code, name) VALUES
  (1,'Kitchen'),(2,'House'),(3,'Bar'),(4,'Hall'),(5,'Social Media'),
  (6,'Admin'),(7,'Financial Affairs'),(8,'Security'),(9,'Cashier');

-- Employees
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  gender smallint NOT NULL CHECK (gender IN (1,2)),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  seq integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Attendance
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all attendance" ON public.attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_attendance_employee ON public.attendance(employee_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_employees_touch BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_attendance_touch BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomic employee creation with auto-generated code
CREATE OR REPLACE FUNCTION public.create_employee(
  p_full_name text, p_gender smallint, p_department_code smallint
) RETURNS public.employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept public.departments;
  v_seq integer;
  v_code text;
  v_row public.employees;
BEGIN
  SELECT * INTO v_dept FROM public.departments WHERE code = p_department_code;
  IF v_dept.id IS NULL THEN RAISE EXCEPTION 'Department not found'; END IF;

  SELECT COALESCE(MAX(seq),0)+1 INTO v_seq
    FROM public.employees
    WHERE department_id = v_dept.id AND gender = p_gender;

  v_code := lpad(p_department_code::text, 2, '0')
         || p_gender::text
         || lpad(v_seq::text, 3, '0');

  INSERT INTO public.employees (employee_code, full_name, gender, department_id, seq)
  VALUES (v_code, p_full_name, p_gender, v_dept.id, v_seq)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.create_employee(text, smallint, smallint) TO authenticated;

-- Scan QR (check-in/check-out logic, Africa/Cairo timezone)
CREATE OR REPLACE FUNCTION public.scan_qr(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT * INTO v_row FROM public.attendance
    WHERE employee_id = v_emp.id AND date = v_today FOR UPDATE;

  IF v_row.id IS NULL THEN
    INSERT INTO public.attendance (employee_id, date, check_in, status)
      VALUES (v_emp.id, v_today, v_now, 'present')
      RETURNING * INTO v_row;
    v_action := 'check_in';
  ELSIF v_row.check_in IS NULL THEN
    UPDATE public.attendance SET check_in = v_now, status='present'
      WHERE id = v_row.id RETURNING * INTO v_row;
    v_action := 'check_in';
  ELSIF v_row.check_out IS NULL THEN
    -- debounce: ignore second scan within 10 seconds of check-in
    IF v_now - v_row.check_in < interval '10 seconds' THEN
      RETURN jsonb_build_object('ok', true, 'action', 'ignored',
        'employee', to_jsonb(v_emp), 'attendance', to_jsonb(v_row));
    END IF;
    UPDATE public.attendance SET check_out = v_now
      WHERE id = v_row.id RETURNING * INTO v_row;
    v_action := 'check_out';
  ELSE
    -- already checked out; update check_out to latest scan (debounced)
    IF v_now - v_row.check_out < interval '10 seconds' THEN
      RETURN jsonb_build_object('ok', true, 'action', 'ignored',
        'employee', to_jsonb(v_emp), 'attendance', to_jsonb(v_row));
    END IF;
    UPDATE public.attendance SET check_out = v_now
      WHERE id = v_row.id RETURNING * INTO v_row;
    v_action := 'check_out_update';
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', v_action,
    'employee', to_jsonb(v_emp), 'attendance', to_jsonb(v_row));
END $$;
GRANT EXECUTE ON FUNCTION public.scan_qr(text) TO authenticated;

-- Mark yesterday's absentees (Cairo time)
CREATE OR REPLACE FUNCTION public.mark_absentees()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_yesterday date;
  v_count integer := 0;
BEGIN
  v_yesterday := ((now() AT TIME ZONE 'Africa/Cairo')::date) - 1;
  INSERT INTO public.attendance (employee_id, date, status)
    SELECT e.id, v_yesterday, 'absent'
    FROM public.employees e
    WHERE e.created_at <= (v_yesterday + 1)::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance a
        WHERE a.employee_id = e.id AND a.date = v_yesterday
      );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.mark_absentees() TO authenticated, anon, service_role;
