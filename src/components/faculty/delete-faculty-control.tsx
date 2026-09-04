type DeleteFacultyControlProps = {
  userId: string;
  facultyName: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function DeleteFacultyControl({ userId, facultyName, action }: DeleteFacultyControlProps) {
  return (
    <details className="delete-faculty-control">
      <summary className="danger-button">Delete Faculty</summary>
      <div className="delete-confirmation">
        <p>
          Delete {facultyName}? Access will end immediately. Related classes and historical records
          will remain preserved.
        </p>
        <form action={action}>
          <input type="hidden" name="userId" value={userId} />
          <button className="danger-button">Confirm Delete Faculty</button>
        </form>
      </div>
    </details>
  );
}
