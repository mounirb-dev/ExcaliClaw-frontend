import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { USER_KEY } from '../utils/impersonation';
import { displayFontFamily } from "../utils/displayFont";
import { PasswordCard } from "./profile/PasswordCard";
import { PersonalInfoCard } from "./profile/PersonalInfoCard";
import { useCollectionsStore } from "../store/collectionsStore";
import { useT } from "../i18n/useT";

export const Profile: React.FC = () => {
    const { t } = useT();
    const { user: authUser, logout, authEnabled } = useAuth();
    const navigate = useNavigate();
    const mustResetPassword = Boolean(authUser?.mustResetPassword);
    const collections = useCollectionsStore((s) => s.collections);
    const setCollections = useCollectionsStore((s) => s.setCollections);
    const hydrateCollections = useCollectionsStore((s) => s.hydrate);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);



    useEffect(() => {
        if (authEnabled === false) {
            navigate('/app/settings', { replace: true });
            return;
        }
        void hydrateCollections();
        if (authUser) {
            setName(authUser.name);
            setEmail(authUser.email);
        }
    }, [authEnabled, authUser, navigate, hydrateCollections]);





    const handleSelectCollection = (id: string | null | undefined) => {
        if (id === undefined) navigate('/app');
        else if (id === null) navigate('/app/collections?id=unorganized');
        else navigate(`/app/collections?id=${id}`);
    };

    const handleCreateCollection = async (name: string) => {
        await api.createCollection(name);
        const newCollections = await api.getCollections();
        setCollections(newCollections);
    };

    const handleEditCollection = async (id: string, name: string) => {
        setCollections(prev => prev.map(c => c.id === id ? { ...c, name } : c));
        await api.updateCollection(id, name);
    };

    const handleDeleteCollection = async (id: string) => {
        setCollections(prev => prev.filter(c => c.id !== id));
        await api.deleteCollection(id);
    };

    const handleUpdateName = async () => {
        if (mustResetPassword) {
            setError(t('profile.errorMustResetBeforeProfile'));
            return;
        }
        if (!name.trim()) {
            setError(t('profile.errorNameEmpty'));
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.put<{ user: { id: string; email: string; name: string; createdAt: string; updatedAt: string } }>('/auth/profile', { name: name.trim() });
            setSuccess(t('profile.nameUpdatedSuccess'));
            if (response.data?.user) {
                localStorage.setItem('excalidash-user', JSON.stringify(response.data.user));
                setTimeout(() => window.location.reload(), 500);
            }
        } catch (err: unknown) {
            let message = t('profile.errorUpdateNameFailed');
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };



    const handleUpdateEmail = async () => {
        if (mustResetPassword) {
            setError(t('profile.errorMustResetBeforeEmail'));
            return;
        }
        if (!email.trim()) {
            setError(t('profile.errorEmailEmpty'));
            return;
        }
        if (!emailCurrentPassword) {
            setError(t('profile.errorCurrentPasswordRequired'));
            return;
        }

        setEmailLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.put<{
                user: { id: string; email: string; name: string; createdAt: string; updatedAt: string };
            }>('/auth/email', {
                email: email.trim(),
                currentPassword: emailCurrentPassword,
            });

            localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));

            setSuccess(t('profile.emailUpdatedSuccess'));
            setShowEmailForm(false);
            setEmailCurrentPassword('');

            setTimeout(() => window.location.reload(), 500);
        } catch (err: unknown) {
            let message = t('profile.errorUpdateEmailFailed');
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setEmailLoading(false);
        }
    };

    return (
        <Layout
            collections={collections}
            selectedCollectionId="PROFILE"
            onSelectCollection={handleSelectCollection}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
        >
            <h1 className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: displayFontFamily }}>
                {t('profile.title')}
            </h1>

            {success && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                    <p className="text-green-800 dark:text-green-200 font-medium">{success}</p>
                </div>
            )}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
                </div>
            )}

            <div className="space-y-6">
                <PersonalInfoCard
                    mustResetPassword={mustResetPassword}
                    name={name}
                    onNameChange={setName}
                    email={email}
                    onEmailChange={setEmail}
                    authUserEmail={authUser?.email}
                    authUserName={authUser?.name}
                    showEmailForm={showEmailForm}
                    onShowEmailFormChange={setShowEmailForm}
                    emailCurrentPassword={emailCurrentPassword}
                    onEmailCurrentPasswordChange={setEmailCurrentPassword}
                    emailLoading={emailLoading}
                    loading={loading}
                    onUpdateEmail={handleUpdateEmail}
                    onUpdateName={handleUpdateName}
                    onError={setError}
                    onSuccess={setSuccess}
                />

                <PasswordCard
                    mustResetPassword={mustResetPassword}
                    logout={logout}
                    onError={setError}
                    onSuccess={setSuccess}
                />
            </div>
        </Layout>
    );
};
