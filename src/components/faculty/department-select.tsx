type DepartmentOption = { id: string; name: string; status: "ACTIVE" | "ARCHIVED" };

export function DepartmentSelect({
  departments,
  currentDepartmentId,
  name = "departmentId",
}: {
  departments: DepartmentOption[];
  currentDepartmentId?: string | null;
  name?: string;
}) {
  const options = departments.filter(
    (department) => department.status === "ACTIVE" || department.id === currentDepartmentId,
  );
  return (
    <select name={name} defaultValue={currentDepartmentId ?? ""}>
      <option value="">No Department</option>
      {options.map((department) => (
        <option value={department.id} key={department.id}>
          {department.name}
          {department.status === "ARCHIVED" ? " (Archived)" : ""}
        </option>
      ))}
    </select>
  );
}
