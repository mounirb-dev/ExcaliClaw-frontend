import React from "react";
import { Layout } from "../components/Layout";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import { PricingPlans } from "../components/PricingPlans";
import { BillingCard } from "../components/BillingCard";
import { displayFontFamily } from "../utils/displayFont";
import { useCollectionsStore } from "../store/collectionsStore";
import { useT } from "../i18n/useT";

export const Plans: React.FC = () => {
  const collections = useCollectionsStore((s) => s.collections);
  const setCollections = useCollectionsStore((s) => s.setCollections);
  const navigate = useNavigate();
  const { t } = useT();

  const handleSelectCollection = (id: string | null | undefined) => {
    if (id === undefined) navigate("/app");
    else if (id === null) navigate("/app/collections?id=unorganized");
    else navigate(`/app/collections?id=${id}`);
  };
  const handleCreateCollection = async (name: string) => {
    await api.createCollection(name);
    const newCollections = await api.getCollections();
    setCollections(newCollections);
  };
  const handleEditCollection = async (id: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    await api.updateCollection(id, name);
  };
  const handleDeleteCollection = async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await api.deleteCollection(id);
  };

  return (
    <Layout
      collections={collections}
      selectedCollectionId="PLANS"
      onSelectCollection={handleSelectCollection}
      onCreateCollection={handleCreateCollection}
      onEditCollection={handleEditCollection}
      onDeleteCollection={handleDeleteCollection}
    >
      <h1
        className="text-3xl sm:text-4xl lg:text-5xl mb-6 lg:mb-8 text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {t("plan.title")}
      </h1>
      <div className="max-w-sm mb-8">
        <BillingCard />
      </div>
      <PricingPlans />
    </Layout>
  );
};
