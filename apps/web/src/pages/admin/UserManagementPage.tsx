import { useEffect, useState } from 'react';
import { usersApi } from '@/api/client';
import type { PublicUser } from '@nonotion/shared';
import { useAuthStore } from '@/stores/authStore';

export default function UserManagementPage() {
    const { user: currentUser } = useAuthStore();
    const [users, setUsers] = useState<PublicUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetSuccess, setResetSuccess] = useState<string | null>(null);
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            setLoading(true);
            const data = await usersApi.getAll();
            setUsers(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }

    async function toggleAdmin(user: PublicUser) {
        if (user.id === currentUser?.id) return;

        try {
            setActionLoading(user.id);
            const newRole = user.role === 'admin' ? 'user' : 'admin';
            const updated = await usersApi.updateRole(user.id, newRole);
            setUsers(users.map(u => u.id === user.id ? updated : u));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update role');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleResetPassword(e: React.FormEvent) {
        e.preventDefault();
        if (!resetPasswordUserId) return;

        try {
            setActionLoading(resetPasswordUserId);
            await usersApi.resetPassword(resetPasswordUserId, {
                newPassword,
                mustChangePassword: true
            });
            setResetSuccess(`Password reset for user successfully.`);
            setResetPasswordUserId(null);
            setNewPassword('');
            setTimeout(() => setResetSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset password');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleDeleteUser() {
        if (!deleteUserId) return;

        try {
            setActionLoading(deleteUserId);
            await usersApi.delete(deleteUserId);
            setUsers(users.filter(u => u.id !== deleteUserId));
            setDeleteUserId(null);
            setResetSuccess('User deleted successfully.');
            setTimeout(() => setResetSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete user');
        } finally {
            setActionLoading(null);
        }
    }

    async function toggleApproval(user: PublicUser) {
        if (user.id === currentUser?.id) return;

        try {
            setActionLoading(user.id);
            const updated = await usersApi.approve(user.id, !user.approved);
            setUsers(users.map(u => u.id === user.id ? updated : u));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update approval status');
        } finally {
            setActionLoading(null);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-notion-text-secondary">Loading users...</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto py-12 px-8">
            <h1 className="text-3xl font-bold text-notion-text mb-8">User Management</h1>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-sm font-bold">dismiss</button>
                </div>
            )}

            {resetSuccess && (
                <div className="bg-green-50 text-green-600 p-4 rounded-md mb-6">
                    {resetSuccess}
                </div>
            )}

            <div className="bg-white border border-notion-border rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-notion-hover border-b border-notion-border">
                            <th className="py-3 px-4 font-semibold text-sm text-notion-text-secondary">User</th>
                            <th className="py-3 px-4 font-semibold text-sm text-notion-text-secondary">Email</th>
                            <th className="py-3 px-4 font-semibold text-sm text-notion-text-secondary">Role</th>
                            <th className="py-3 px-4 font-semibold text-sm text-notion-text-secondary">Status</th>
                            <th className="py-3 px-4 font-semibold text-sm text-notion-text-secondary">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="border-b border-notion-border last:border-0 hover:bg-notion-hover/50">
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                        {user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <span className="font-medium text-notion-text">{user.name}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-notion-text-secondary text-sm">
                                    {user.email}
                                </td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.role === 'admin'
                                        ? 'bg-purple-100 text-purple-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.approved
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {user.approved ? 'Approved' : 'Pending'}
                                    </span>
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                        {user.id !== currentUser?.id && (
                                            <>
                                                {!user.approved ? (
                                                    <button
                                                        onClick={() => toggleApproval(user)}
                                                        disabled={actionLoading === user.id}
                                                        className="text-xs px-2 py-1 border border-green-300 rounded hover:bg-green-50 text-green-600 disabled:opacity-50"
                                                    >
                                                        Approve
                                                    </button>
                                                ) : user.role !== 'admin' && (
                                                    <button
                                                        onClick={() => toggleApproval(user)}
                                                        disabled={actionLoading === user.id}
                                                        className="text-xs px-2 py-1 border border-yellow-300 rounded hover:bg-yellow-50 text-yellow-600 disabled:opacity-50"
                                                    >
                                                        Revoke
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => toggleAdmin(user)}
                                                    disabled={actionLoading === user.id}
                                                    className="text-xs px-2 py-1 border border-notion-border rounded hover:bg-notion-hover text-notion-text disabled:opacity-50"
                                                >
                                                    {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                                                </button>
                                            </>
                                        )}

                                        <button
                                            onClick={() => {
                                                setResetPasswordUserId(user.id);
                                                setNewPassword('');
                                                setError(null);
                                            }}
                                            disabled={actionLoading === user.id}
                                            className="text-xs px-2 py-1 border border-notion-border rounded hover:bg-notion-hover text-notion-text disabled:opacity-50"
                                        >
                                            Reset Password
                                        </button>

                                        {user.id !== currentUser?.id && (
                                            <button
                                                onClick={() => setDeleteUserId(user.id)}
                                                disabled={actionLoading === user.id}
                                                className="text-xs px-2 py-1 border border-red-300 rounded hover:bg-red-50 text-red-600 disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        )}

                                        {user.id === currentUser?.id && (
                                            <span className="text-xs text-notion-text-secondary italic"> (You)</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {resetPasswordUserId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold text-notion-text mb-4">Reset Password</h3>
                        <p className="text-sm text-notion-text-secondary mb-4">
                            Enter a new temporary password for this user. They will be forced to change it upon next login.
                        </p>
                        <form onSubmit={handleResetPassword}>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="New Password"
                                className="w-full px-3 py-2 border border-notion-border rounded focus:outline-none focus:border-blue-500 mb-4"
                                autoFocus
                                required
                                minLength={8}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setResetPasswordUserId(null)}
                                    className="px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading === resetPasswordUserId}
                                    className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                                >
                                    {actionLoading === resetPasswordUserId ? 'Resetting...' : 'Reset Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteUserId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold text-notion-text mb-4">Delete User</h3>
                        <p className="text-sm text-notion-text-secondary mb-4">
                            Are you sure you want to delete this user? Their pages will be transferred to you.
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteUserId(null)}
                                className="px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover rounded"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteUser}
                                disabled={actionLoading === deleteUserId}
                                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                            >
                                {actionLoading === deleteUserId ? 'Deleting...' : 'Delete User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
