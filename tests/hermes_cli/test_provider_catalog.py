"""Tests for the unified provider catalog (hermes_cli.provider_catalog).

These are invariant tests, not snapshots: they assert the parity *contract*
between what ``hermes model`` shows (``CANONICAL_PROVIDERS``) and what the
catalog exposes, plus how each provider's ``auth_type`` maps to a desktop tab —
never a specific provider count or a frozen vendor list (both change over time).
"""

from hermes_cli.provider_catalog import (
    provider_catalog,
    provider_catalog_by_slug,
)

def test_profileless_providers_still_present():
    """Providers without a ProviderProfile must still resolve via fallbacks.

    lmstudio / openai-api / tencent-tokenhub / xai-oauth have no profile on
    main; they exist only as registry + canonical entries. The catalog must
    not require a profile to include a provider.
    """
    by = provider_catalog_by_slug()
    for slug in ("lmstudio", "openai-api", "tencent-tokenhub", "xai-oauth"):
        assert slug in by, f"{slug} dropped from catalog (profile-less provider)"
        assert by[slug].label, f"{slug} has empty label despite canonical fallback"
        assert by[slug].description, f"{slug} has empty description despite fallback"

def test_copilot_surfaces_as_a_provider_with_its_own_token_var():
    """Regression for the reported bug: a GitHub Copilot login showed up under
    tools, never as a provider, because the shared GITHUB_TOKEN is tool-category.

    Copilot authenticates via the `copilot`/api_key path, so it belongs on the
    keys tab — but its PRIMARY credential var must be the provider-owned
    COPILOT_GITHUB_TOKEN, not the shared tool-category GITHUB_TOKEN. That is what
    lets the desktop render Copilot as its own provider card.
    """
    by = provider_catalog_by_slug()
    assert "copilot" in by
    d = by["copilot"]
    assert d.tab == "keys"
    assert d.api_key_env_vars, "Copilot must expose a credential env var"
    assert d.api_key_env_vars[0] == "COPILOT_GITHUB_TOKEN", (
        "Copilot's primary var must be the provider-owned token, not shared GITHUB_TOKEN"
    )

def test_api_key_providers_expose_a_credential_env_var():
    """Every keys-tab provider that authenticates via a pasted API key must
    surface at least one env var to write the key into (otherwise the GUI can't
    configure it).

    Exemptions: ``aws_sdk`` (bedrock — uses AWS_REGION/AWS_PROFILE) and the
    ``custom`` bring-your-own-endpoint pseudo-provider (configured inline via
    the ``local-endpoint`` flow).
    """
    exempt = {"custom"}
    for d in provider_catalog():
        if d.auth_type == "api_key" and d.slug not in exempt:
            assert d.api_key_env_vars, f"{d.slug} is api_key but exposes no env var"


def test_domestic_providers_pinned_to_top():
    """crab 0.20.5-ab+3: the desktop Keys tab leads with domestic providers.

    Contract: every domestic slug appears before any non-domestic slug in the
    catalog order, and the domestic group keeps its pinned relative order.
    """
    from hermes_cli.provider_catalog import provider_catalog
    _DOMESTIC = ("doubao", "wenxin", "deepseek", "zai", "kimi-coding-cn",
                 "minimax-cn", "alibaba", "xiaomi", "siliconflow",
                 "tencent-tokenhub", "tencent-tokenplan", "qwen-oauth")
    order = [d.slug for d in provider_catalog()]
    domestic_seen = [s for s in order if s in _DOMESTIC]
    first_foreign = next(i for i, s in enumerate(order) if s not in _DOMESTIC)
    last_domestic = max((order.index(s) for s in domestic_seen), default=-1)
    assert last_domestic < first_foreign, (
        f"domestic providers must lead: last domestic idx {last_domestic} "
        f"vs first foreign idx {first_foreign}")
    pinned = [s for s in _DOMESTIC if s in order]
    assert domestic_seen == pinned, f"domestic order drifted: {domestic_seen} != {pinned}"
