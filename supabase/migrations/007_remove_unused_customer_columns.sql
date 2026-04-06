-- ============================================================
-- Migration 007 — Remove unused columns from customers
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

alter table customers
  drop column if exists points,
  drop column if exists phone,
  drop column if exists wetransfer_link;
