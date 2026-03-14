import "dotenv/config";
import { db } from "./index";
import { user, registryItems, registryFiles } from "./schema";
import { eq } from "drizzle-orm";

const heroSectionCode = `"use client";

import React from "react";

export interface HeroSectionProps {
  title: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
}

export function HeroSection({
  title,
  subtitle = "Build something amazing with our platform",
  ctaText = "Get Started",
  ctaHref = "#",
}: HeroSectionProps) {
  return (
    <section className="py-24 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6">
        {title}
      </h1>
      <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
        {subtitle}
      </p>
      <a
        href={ctaHref}
        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-8 py-3 text-sm font-medium text-white shadow hover:bg-blue-700"
      >
        {ctaText}
      </a>
    </section>
  );
}
`;

const faqCode = `"use client";

import React, { useState } from "react";

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQProps {
  items: FAQItem[];
  title?: string;
}

export function FAQ({ items, title = "Frequently Asked Questions" }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-16 px-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-8">{title}</h2>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="border rounded-lg overflow-hidden"
          >
            <button
              className="w-full px-4 py-3 text-left font-medium flex justify-between items-center hover:bg-gray-50"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              {item.question}
              <span className="text-gray-500">
                {openIndex === index ? "−" : "+"}
              </span>
            </button>
            {openIndex === index && (
              <div className="px-4 py-3 bg-gray-50 text-gray-600 border-t">
                {item.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
`;

const pricingCardCode = `"use client";

import React from "react";

export interface PricingFeature {
  text: string;
  included: boolean;
}

export interface PricingCardProps {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: PricingFeature[];
  ctaText?: string;
  ctaHref?: string;
  highlighted?: boolean;
}

export function PricingCard({
  name,
  price,
  period = "/month",
  description,
  features,
  ctaText = "Get Started",
  ctaHref = "#",
  highlighted = false,
}: PricingCardProps) {
  return (
    <div
      className={\`rounded-xl border p-6 \${highlighted ? "border-blue-600 shadow-lg" : ""}\`}
    >
      <h3 className="font-bold text-lg">{name}</h3>
      <div className="mt-4">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-gray-500">{period}</span>
      </div>
      {description && (
        <p className="text-sm text-gray-500 mt-2">{description}</p>
      )}
      <ul className="mt-6 space-y-2">
        {features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={f.included ? "text-blue-600" : "text-gray-400"}>
              {f.included ? "✓" : "−"}
            </span>
            {f.text}
          </li>
        ))}
      </ul>
      <a
        href={ctaHref}
        className={\`mt-6 block w-full text-center rounded-md py-2 text-sm font-medium \${highlighted ? "bg-blue-600 text-white" : "border"} hover:opacity-90\`}
      >
        {ctaText}
      </a>
    </div>
  );
}
`;

const LEGACY_USER_ID = "legacy";

async function seed() {
  // Ensure legacy user exists for seed items
  const [existingUser] = await db.select().from(user).where(eq(user.id, LEGACY_USER_ID)).limit(1);
  if (!existingUser) {
    await db.insert(user).values({
      id: LEGACY_USER_ID,
      name: "Legacy",
      email: "legacy@system.local",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const items = [
    {
      name: "hero-section",
      type: "registry:block",
      title: "Hero Section",
      description:
        "Landing 页首屏 Hero，含标题、副标题、主 CTA 按钮。适用于产品介绍、活动页首屏。",
      meta: { tags: ["landing", "hero", "首屏"], useWhen: ["landing page", "首屏", "产品介绍"] },
      code: heroSectionCode,
    },
    {
      name: "faq",
      type: "registry:block",
      title: "FAQ",
      description:
        "常见问题折叠组件，支持展开/收起。适用于 Landing 页、帮助中心。",
      meta: { tags: ["faq", "accordion", "常见问题"], useWhen: ["FAQ", "常见问题", "帮助中心"] },
      code: faqCode,
    },
    {
      name: "pricing-card",
      type: "registry:block",
      title: "Pricing Card",
      description:
        "定价/套餐展示卡片，含价格、功能列表、CTA。适用于定价页、套餐对比。",
      meta: {
        tags: ["pricing", "card", "定价"],
        useWhen: ["pricing", "定价", "套餐", "subscription"],
      },
      code: pricingCardCode,
    },
  ];

  const addedNames: string[] = [];
  for (const item of items) {
    const [inserted] = await db
      .insert(registryItems)
      .values({
        userId: LEGACY_USER_ID,
        name: item.name,
        type: item.type,
        title: item.title,
        description: item.description,
        meta: item.meta,
      })
      .onConflictDoNothing({
        target: [registryItems.userId, registryItems.name],
      })
      .returning();

    if (inserted) {
      await db.insert(registryFiles).values({
        itemId: inserted.id,
        path: `registry/modules/${item.name}.tsx`,
        content: item.code,
        type: item.type,
      });
      addedNames.push(item.name);
    }
  }

  console.log(
    addedNames.length > 0
      ? `Seed completed. Added: ${addedNames.join(", ")}`
      : "Seed completed. All items already exist."
  );
}

seed().catch(console.error).finally(process.exit);
