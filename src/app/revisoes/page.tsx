"use client";

import { ReviewCenter } from "@/components/review-center";
import { PageHeader } from "@/components/ui";

export default function ReviewsPage() {
  return (
    <div className="reviews-page">
      <PageHeader title="Revisões" />
      <ReviewCenter />
    </div>
  );
}
