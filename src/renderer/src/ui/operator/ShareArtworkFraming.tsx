import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Image,
  Modal,
  NavLink,
  Pagination,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  characterFramingGroup,
  characterFramingGroupMemberLimit,
  leadCharacterAsset,
  selectedCharacterAssetId,
  type CharacterFramingGroup,
  type CharacterFramingGroupEdit
} from '@shared/characterAssets';
import type { PlayerState } from '@shared/models';
import { api } from '../../api';
import { useAssetRevision } from '../../hooks/useCatalogRevision';
import { IconLabel, ImageIcon } from '../icons';
import '../panelHeader.css';
import './shareArtworkFraming.css';

const pageSize = 8;
type GroupChoices = {
  selected: string;
  choices: string[];
  groups: CharacterFramingGroup[];
};

function groupsForArtwork(groups: CharacterFramingGroup[], choices: string[]) {
  return groups.filter(({ anchor, members }) => choices.includes(anchor) || members.some((id) => choices.includes(id)));
}

export function ShareArtworkFraming({
  game,
  player,
  disabled
}: {
  game: string;
  player: PlayerState;
  disabled?: boolean;
}) {
  const { t } = useTranslation(['operator', 'common']);
  const [opened, setOpened] = useState(false);
  const [catalog, setCatalog] = useState<GroupChoices>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [groupSearch, setGroupSearch] = useState('');
  const revision = useAssetRevision();
  const character = player.characters?.[0] ?? player.character;

  useEffect(() => {
    if (opened) return;
    let active = true;
    void api.gameCharacterAssets(game).then(
      ({ assets, framingGroups = [] }) => {
        if (!active) return;
        const artwork = leadCharacterAsset(player, assets);
        const selected = selectedCharacterAssetId(player, assets);
        if (!selected || !artwork) {
          setCatalog(undefined);
          return;
        }
        const ids = [artwork.assetId, ...artwork.variants.map(({ assetId }) => assetId)];
        const choices = [...new Set(ids.filter((id): id is string => Boolean(id)))];
        setCatalog({
          selected,
          choices,
          groups: groupsForArtwork(framingGroups, choices)
        });
      },
      () => {
        if (active) setCatalog(undefined);
      }
    );
    return () => {
      active = false;
    };
  }, [game, character, player.characterAssetId, revision, opened]);

  const [draft, setDraft] = useState<CharacterFramingGroupEdit>();
  const selectedGroup = characterFramingGroup(catalog?.selected, catalog?.groups);
  const choices = catalog?.choices.filter((id) => id !== draft?.anchor) ?? [];
  const groupQuery = groupSearch.trim().toLocaleLowerCase();
  const visibleGroups = groupQuery
    ? catalog?.groups.filter(({ number, anchor }) =>
        `${t('artworkFraming.groupNumber', { number })} ${anchor}`.toLocaleLowerCase().includes(groupQuery)
      )
    : catalog?.groups;
  if ((!catalog || (catalog.choices.length < 2 && !selectedGroup)) && !opened) return null;

  function chooseGroup(group?: CharacterFramingGroup) {
    if (!catalog) return;
    setDraft(
      group
        ? {
            number: group.number,
            anchor: group.anchor,
            members: group.members.filter((id) => catalog.choices.includes(id)),
            useSharedForAdjusted: group.useSharedForAdjusted
          }
        : { anchor: catalog.selected, members: [], useSharedForAdjusted: false }
    );
    setFailed(false);
    setPage(1);
  }

  function open() {
    if (!catalog) return;
    chooseGroup(selectedGroup);
    setGroupSearch('');
    setOpened(true);
  }
  async function save(group: CharacterFramingGroupEdit) {
    setSaving(true);
    setFailed(false);
    try {
      const groups = await api.saveCharacterFramingGroup(game, group);
      setCatalog((current) => current && { ...current, groups: groupsForArtwork(groups, current.choices) });
      setOpened(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function deleteGroup(group: CharacterFramingGroupEdit) {
    if (group.number === undefined) return;
    if (window.confirm(t('artworkFraming.deleteConfirm', { number: group.number }))) {
      void save({ ...group, members: [] });
    }
  }

  return (
    <>
      <Button variant="default" disabled={disabled} onClick={open}>
        {t('artworkFraming.share')}
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          <Text component="span" fw={800} size="lg">
            <IconLabel icon={ImageIcon} size={18}>
              {t('artworkFraming.share')}
            </IconLabel>
          </Text>
        }
        classNames={{
          body: 'artwork-group-dialog-body',
          header: 'operator-section-header',
          title: 'operator-section-header-title'
        }}
        padding="md"
        styles={{ body: { paddingTop: 'var(--mantine-spacing-md)' } }}
        size="xl"
        centered
        returnFocus
        closeOnEscape={!saving}
        closeOnClickOutside={!saving}
        withCloseButton={!saving}
        overlayProps={{ backgroundOpacity: 0.72, blur: 5 }}
      >
        {draft && catalog && (
          <Stack gap="md">
            <div className={`artwork-group-layout${catalog.groups.length ? ' has-groups' : ''}`}>
              {catalog.groups.length > 0 && (
                <Stack
                  component="section"
                  aria-label={t('artworkFraming.groups')}
                  className="artwork-group-browser"
                  gap="xs"
                >
                  <Text size="sm" fw={700}>
                    {t('artworkFraming.groups')}
                  </Text>
                  {catalog.groups.length > 5 && (
                    <TextInput
                      size="xs"
                      aria-label={t('artworkFraming.searchGroups')}
                      placeholder={t('artworkFraming.searchGroups')}
                      value={groupSearch}
                      disabled={saving}
                      onChange={(event) => setGroupSearch(event.currentTarget.value)}
                    />
                  )}
                  <ScrollArea.Autosize
                    mah="var(--artwork-group-list-height)"
                    type="auto"
                    scrollbars="y"
                    offsetScrollbars="present"
                  >
                    {visibleGroups?.map((group) => (
                      <NavLink
                        key={group.number}
                        component="button"
                        type="button"
                        leftSection={<ArtworkThumbnail game={game} id={group.anchor} compact />}
                        styles={{ section: { marginInlineEnd: 'var(--mantine-spacing-xs)' } }}
                        label={t('artworkFraming.groupNumber', { number: group.number })}
                        description={
                          <Text component="span" display="block" size="xs" truncate title={group.anchor}>
                            {group.anchor}
                          </Text>
                        }
                        active={draft.number === group.number}
                        aria-pressed={draft.number === group.number}
                        disabled={saving}
                        onClick={() => draft.number !== group.number && chooseGroup(group)}
                      />
                    ))}
                    {!visibleGroups?.length && (
                      <Text size="xs" c="dimmed" role="status">
                        {t('artworkFraming.noGroupsFound')}
                      </Text>
                    )}
                  </ScrollArea.Autosize>
                  <Button
                    size="xs"
                    variant={draft.number === undefined ? 'light' : 'default'}
                    aria-pressed={draft.number === undefined}
                    disabled={saving}
                    onClick={() => draft.number !== undefined && chooseGroup()}
                  >
                    {t('artworkFraming.newGroup')}
                  </Button>
                </Stack>
              )}
              <Stack gap="md" miw={0}>
                <Group wrap="nowrap" gap="md">
                  <ArtworkThumbnail game={game} id={draft.anchor} width={96} />
                  <Stack gap={4} miw={0}>
                    {catalog.groups.length > 0 && (
                      <Text size="sm" fw={700}>
                        {draft.number === undefined
                          ? t('artworkFraming.newGroup')
                          : t('artworkFraming.groupNumber', { number: draft.number })}
                      </Text>
                    )}
                    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                      {t('artworkFraming.shareHelp', { image: draft.anchor })}
                    </Text>
                  </Stack>
                </Group>
                <SimpleGrid type="container" cols={{ base: 2, '25rem': 3, '31rem': 4 }}>
                  {choices.slice((page - 1) * pageSize, page * pageSize).map((id) => {
                    const source = characterFramingGroup(id, catalog.groups);
                    const movingFrom = source && source.number !== draft.number ? source.number : undefined;
                    return (
                      <Stack
                        key={id}
                        gap="xs"
                        p="xs"
                        bd="1px solid var(--mantine-color-default-border)"
                        style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                      >
                        <ArtworkThumbnail game={game} id={id} />
                        <Checkbox
                          label={
                            <Text component="span" size="xs" style={{ overflowWrap: 'anywhere' }}>
                              {id}
                              {movingFrom !== undefined && (
                                <Text component="span" display="block" size="xs" c="dimmed">
                                  {t(
                                    draft.members.includes(id)
                                      ? 'artworkFraming.moveFromGroup'
                                      : 'artworkFraming.inGroup',
                                    { number: movingFrom }
                                  )}
                                </Text>
                              )}
                            </Text>
                          }
                          checked={draft.members.includes(id)}
                          disabled={
                            saving ||
                            (draft.members.length >= characterFramingGroupMemberLimit && !draft.members.includes(id))
                          }
                          onChange={({ currentTarget: { checked } }) =>
                            setDraft({
                              ...draft,
                              members: checked ? [...draft.members, id] : draft.members.filter((item) => item !== id)
                            })
                          }
                        />
                      </Stack>
                    );
                  })}
                </SimpleGrid>
                {choices.length > pageSize && (
                  <Pagination total={Math.ceil(choices.length / pageSize)} value={page} onChange={setPage} />
                )}
                <Checkbox
                  label={t('artworkFraming.useSharedForAdjusted')}
                  checked={draft.useSharedForAdjusted}
                  disabled={saving || !draft.members.length}
                  onChange={({ currentTarget: { checked } }) => setDraft({ ...draft, useSharedForAdjusted: checked })}
                />
                {draft.members.length >= characterFramingGroupMemberLimit && (
                  <Text c="dimmed" size="sm">
                    {t('artworkFraming.groupLimit', { count: characterFramingGroupMemberLimit })}
                  </Text>
                )}
              </Stack>
            </div>
            {failed && <Alert color="red">{t('artworkFraming.shareFailed')}</Alert>}
            <Group justify="flex-end" wrap="wrap">
              {draft.number !== undefined && (
                <Button variant="subtle" color="red" disabled={saving} mr="auto" onClick={() => deleteGroup(draft)}>
                  {t('artworkFraming.deleteGroup')}
                </Button>
              )}
              <Button variant="default" disabled={saving} onClick={() => setOpened(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button loading={saving} disabled={!draft.members.length} onClick={() => void save(draft)}>
                {t('artworkFraming.saveGroup')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}

function ArtworkThumbnail({
  game,
  id,
  width,
  compact = false
}: {
  game: string;
  id: string;
  width?: number;
  compact?: boolean;
}) {
  const [url, setUrl] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let active = true;
    let visible = false;
    function load() {
      visible = true;
      void api.gameCharacterAssetUrl(game, id).then(
        (image) => {
          if (active && visible) setUrl(image);
        },
        () => undefined
      );
    }
    setUrl(undefined);
    const image = imageRef.current;
    const observer =
      compact && image && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            if (!active) return;
            if (entry?.isIntersecting) load();
            else {
              visible = false;
              setUrl(undefined);
            }
          })
        : undefined;
    if (observer && image) observer.observe(image);
    else load();
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [compact, game, id]);
  return <Image ref={imageRef} src={url} h={compact ? 36 : 96} w={compact ? 32 : width} fit="contain" alt="" />;
}
