"use client";

import { Suspense } from "react";
import EditorScreen from "@/components/marketing/EditorScreen";

export default function NewTemplatePage() {
  return (
    <Suspense>
      <EditorScreen />
    </Suspense>
  );
}
