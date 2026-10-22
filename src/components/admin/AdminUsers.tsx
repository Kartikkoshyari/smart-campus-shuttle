import { Users } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAdmin } from '../../hooks/useAdmin.ts'
import { useAuth } from '../../hooks/useAuth.ts'
import { useFleet } from '../../hooks/useFleet.ts'
import { useToast } from '../../hooks/useToast.ts'
import { adminErrorMessage } from '../../services/adminService.ts'
import type { AppUser, Role } from '../../types/index.ts'
import { roleLabel } from '../../utils/format.ts'
import Modal from '../Modal.tsx'
import StateMessage from '../StateMessage.tsx'
import { Cell, DataTable } from './DataTable.tsx'

const roleWithArticle: Record<Role, string> = {
  student: 'a student',
  operator: 'an operator',
  admin: 'an administrator',
}

const roleStyles: Record<Role, string> = {
  student: 'bg-paper text-muted',
  operator: 'bg-signal-tint text-signal-ink',
  admin: 'bg-route-tint text-route-dark',
}

/** Every account, with role and shuttle assignment changes. */
export default function AdminUsers() {
  const admin = useAdmin()
  const { user: me } = useAuth()
  const { shuttles, getShuttle } = useFleet()
  const { notify } = useToast()
  const [users, setUsers] = useState<AppUser[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AppUser | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await admin.listUsers())
      setStatus('ready')
    } catch (caught) {
      setError(adminErrorMessage(caught))
      setStatus('error')
    }
  }, [admin])

  useEffect(() => {
    // load() only sets state after the service answers, never synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const close = useCallback(() => setEditing(null), [])

  async function save(changes: { role: Role; assignedShuttleId: string | null }) {
    if (!editing) return
    const updated = await admin.updateUser(editing.id, changes)
    const shuttleText = updated.assignedShuttleId ? ` on ${getShuttle(updated.assignedShuttleId).code}` : ''
    notify({
      tone: 'success',
      title: `${updated.name} is now ${roleWithArticle[updated.role]}${shuttleText}`,
      message: 'They will see the change the next time they sign in.',
    })
    setEditing(null)
    await load()
  }

  if (status === 'loading') {
    return (
      <div className="panel">
        <StateMessage tone="loading" title="Loading accounts" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="panel">
        <StateMessage
          tone="error"
          title="Accounts could not be loaded"
          action={
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              Try again
            </button>
          }
        >
          {error}
        </StateMessage>
      </div>
    )
  }

  return (
    <>
      {users.length === 0 ? (
        <div className="panel">
          <StateMessage tone="empty" icon={Users} title="No accounts yet" />
        </div>
      ) : (
        <DataTable
          title={`Accounts (${users.length})`}
          aside={<p className="text-xs text-muted">New accounts always start as students.</p>}
          headings={['Name', 'Email', 'Role', 'Shuttle', '']}
        >
          {users.map((person) => (
            <tr key={person.id}>
              <Cell strong>
                {person.name}
                {person.id === me?.id ? <span className="ml-1.5 text-xs font-normal text-muted">(you)</span> : null}
              </Cell>
              <Cell>{person.email}</Cell>
              <Cell>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleStyles[person.role]}`}>
                  {roleLabel[person.role]}
                </span>
              </Cell>
              <Cell>{person.assignedShuttleId ? getShuttle(person.assignedShuttleId).code : '—'}</Cell>
              <Cell>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1"
                  onClick={() => setEditing(person)}
                  aria-label={`Change role for ${person.name}`}
                >
                  Change role
                </button>
              </Cell>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={editing !== null}
        title={editing ? `Change role for ${editing.name}` : 'Change role'}
        description="Operators can run one shuttle. Administrators can manage everything."
        onClose={close}
      >
        {editing ? (
          <RoleForm
            key={editing.id}
            person={editing}
            isSelf={editing.id === me?.id}
            shuttles={shuttles.map((shuttle) => ({ id: shuttle.id, label: `${shuttle.code}, ${shuttle.name}` }))}
            onSave={save}
            onCancel={close}
          />
        ) : null}
      </Modal>
    </>
  )
}

function RoleForm({
  person,
  isSelf,
  shuttles,
  onSave,
  onCancel,
}: {
  person: AppUser
  isSelf: boolean
  shuttles: { id: string; label: string }[]
  onSave(changes: { role: Role; assignedShuttleId: string | null }): Promise<void>
  onCancel(): void
}) {
  const [role, setRole] = useState<Role>(person.role)
  const [shuttleId, setShuttleId] = useState(person.assignedShuttleId ?? shuttles[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({ role, assignedShuttleId: role === 'operator' ? shuttleId : null })
    } catch (caught) {
      setError(adminErrorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <p role="alert" className="rounded-lg bg-alert-tint px-3 py-2.5 text-sm font-medium text-alert">
          {error}
        </p>
      ) : null}
      <div>
        <label htmlFor="role-select" className="field-label">
          Role
        </label>
        <select
          id="role-select"
          className="field-input"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          <option value="student">Student</option>
          <option value="operator">Operator</option>
          <option value="admin">Administrator</option>
        </select>
        {isSelf ? <p className="field-hint">You cannot remove your own administrator role.</p> : null}
      </div>
      {role === 'operator' ? (
        <div>
          <label htmlFor="role-shuttle" className="field-label">
            Shuttle they run
          </label>
          <select
            id="role-shuttle"
            className="field-input"
            value={shuttleId}
            onChange={(event) => setShuttleId(event.target.value)}
          >
            {shuttles.map((shuttle) => (
              <option key={shuttle.id} value={shuttle.id}>
                {shuttle.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving' : 'Save role'}
        </button>
      </div>
    </form>
  )
}
