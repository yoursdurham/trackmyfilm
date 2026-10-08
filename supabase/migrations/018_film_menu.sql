-- ============================================================
-- Migration 018 — Film menu
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Safe to run more than once. Seeds the studio film menu from the
-- standalone Your's Film Menu page. A later run does not overwrite
-- prices or notes the shop has edited.
--
-- API routes use the service role key, which bypasses RLS.
-- No policies: the Data API (anon/authenticated) cannot read or write the menu.
-- ============================================================

create table if not exists film_menus (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint film_menus_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table film_menus add column if not exists content jsonb;
alter table film_menus add column if not exists created_at timestamptz not null default now();
alter table film_menus add column if not exists updated_at timestamptz not null default now();

create unique index if not exists film_menus_slug_idx on film_menus (slug);

comment on table film_menus is
  'Shop film menu for the studio screen. Public routes return this content only; browsers cannot query this table.';

alter table film_menus enable row level security;

insert into film_menus (slug, content)
values ('studio', $menu${
  "title": "YOUR'S FILM MENU",
  "subtitle": "Durham, North Carolina",
  "banner": [
    "35MM / 120 / POLAROID / DISPOSABLES",
    "PRICES SUBJECT TO CHANGE"
  ],
  "sections": [
    {
      "title": "35MM FILM",
      "items": [
        {
          "name": "All Reflx Labs 35mm",
          "price": "$18"
        },
        {
          "name": "Arista EDU Ultra 100 - 35mm",
          "price": "$8.50"
        },
        {
          "name": "Arista EDU Ultra 200 - 35mm",
          "price": "$8.50"
        },
        {
          "name": "Arista EDU Ultra 400 - 35mm",
          "price": "$8.50"
        },
        {
          "name": "Candido 400 - 35mm",
          "price": "$18"
        },
        {
          "name": "Candido 800 - 35mm",
          "price": "$18"
        },
        {
          "name": "Cinestill 400D - 35mm",
          "price": "$20"
        },
        {
          "name": "Cinestill 50D - 35mm",
          "price": "$20"
        },
        {
          "name": "Cinestill 800T - 35mm",
          "price": "$20"
        },
        {
          "name": "Cinestill BWXX - 35mm",
          "price": "$19"
        },
        {
          "name": "Expired 35mm/120 Roll",
          "price": "$7"
        },
        {
          "name": "Fujifilm 200 3-Pack - 35mm",
          "price": "$33"
        },
        {
          "name": "Fujifilm 200 - 35mm",
          "price": "$11"
        },
        {
          "name": "Fujifilm 400 3-Pack - 35mm",
          "price": "$33"
        },
        {
          "name": "Fujifilm 400 - 35mm",
          "price": "$11"
        },
        {
          "name": "Harman Azure 125 - 35mm",
          "price": "$15"
        },
        {
          "name": "Harman Phoenix II 200 Color - 35mm",
          "price": "$15"
        },
        {
          "name": "Ilford HP5 Plus 400 - 35mm",
          "price": "$15"
        },
        {
          "name": "Kentmere Pan 200 - 35mm",
          "price": "$11"
        },
        {
          "name": "Kodacolor 100 - 35mm",
          "price": "$11"
        },
        {
          "name": "Kodacolor 200 - 35mm",
          "price": "$11"
        },
        {
          "name": "Kodak ColorPlus 200 - 35mm",
          "price": "$12"
        },
        {
          "name": "Kodak Ektar 100 - 35mm",
          "price": "$15"
        },
        {
          "name": "Kodak Gold 200 3-Pack - 35mm",
          "price": "$33"
        },
        {
          "name": "Kodak Gold 200 - 35mm",
          "price": "$12"
        },
        {
          "name": "Kodak Portra 160 - 35mm",
          "price": "$19"
        },
        {
          "name": "Kodak Portra 400 - 35mm",
          "price": "$20"
        },
        {
          "name": "Kodak Portra 800 - 35mm",
          "price": "$20"
        },
        {
          "name": "Kodak Pro Image 100 - 35mm",
          "price": "$15"
        },
        {
          "name": "Kodak T-Max 400 - 35mm",
          "price": "$12"
        },
        {
          "name": "Kodak TMax P3200 - 35mm",
          "price": "$15"
        },
        {
          "name": "Kodak Tri-X 400 - 35mm",
          "price": "$12"
        },
        {
          "name": "Kodak UltraMax 400 3-Pack - 35mm",
          "price": "$33"
        },
        {
          "name": "Kodak Ultramax 400 - 35mm",
          "price": "$12"
        },
        {
          "name": "Lucky 200 - 35mm",
          "price": "$15"
        }
      ]
    },
    {
      "title": "120 FILM",
      "items": [
        {
          "name": "Cinestill 400D - 120",
          "price": "$20"
        },
        {
          "name": "Cinestill 800T - 120",
          "price": "$20"
        },
        {
          "name": "Expired 35mm/120 Roll",
          "price": "$7"
        },
        {
          "name": "Harman Azure 125 - 120",
          "price": "$15"
        },
        {
          "name": "Kodak Ektachrome 100 - 120",
          "price": "$21"
        },
        {
          "name": "Kodak Ektar 100 - 120",
          "price": "$15"
        },
        {
          "name": "Kodak Gold 200 - 120",
          "price": "$11"
        },
        {
          "name": "Kodak Portra 160 - 120",
          "price": "$16"
        },
        {
          "name": "Kodak Portra 400 - 120",
          "price": "$17"
        },
        {
          "name": "Kodak Portra 800 - 120",
          "price": "$18"
        },
        {
          "name": "Kodak T-Max 400 - 120",
          "price": "$13"
        },
        {
          "name": "Kodak Tri-X 400 - 120",
          "price": "$13"
        },
        {
          "name": "Lucky 200 - 120",
          "price": "$15"
        }
      ]
    },
    {
      "title": "POLAROID + DISPOSABLES",
      "items": [
        {
          "name": "Kodak FunSaver",
          "price": "$21"
        },
        {
          "name": "Polaroid 600 - B/W",
          "price": "$23"
        },
        {
          "name": "Polaroid 600 - Circle Frame",
          "price": "$23"
        },
        {
          "name": "Polaroid 600 - Color",
          "price": "$23"
        },
        {
          "name": "Polaroid 600 - Purple Special Edition",
          "price": "$25"
        },
        {
          "name": "Polaroid Go Film",
          "price": "$23"
        },
        {
          "name": "Polaroid SX-70 - B/W",
          "price": "$29"
        },
        {
          "name": "Polaroid SX-70 - Color",
          "price": "$29"
        },
        {
          "name": "Polaroid i-Type - B/W",
          "price": "$23"
        },
        {
          "name": "Polaroid i-Type - Color",
          "price": "$23"
        }
      ]
    }
  ],
  "notes": [
    {
      "text": "Ask us about film processing + scanning"
    },
    {
      "text": "YOURSDURHAM.COM / @YOURSDURHAM"
    },
    {
      "text": "Please rewind your film."
    },
    {
      "text": "FILM PROCESSING",
      "heading": true
    },
    {
      "text": "FILM IS DROPPED OFF AT THE LAB TUESDAYS + FRIDAYS AT NOON"
    },
    {
      "text": "TRACK YOUR FILM",
      "heading": true
    },
    {
      "text": "TRACK YOUR FILM STATUS AT TRACKMYFILM.COM"
    }
  ]
}$menu$::jsonb)
on conflict (slug) do nothing;
