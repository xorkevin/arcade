import {
  type FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Box,
  BoxSize,
  Flex,
  FlexAlignItems,
  FlexClasses,
  FlexDir,
} from '@xorkevin/nuke/component/box';
import {
  Button,
  ButtonGroup,
  ButtonVariant,
} from '@xorkevin/nuke/component/button';
import {
  Field,
  Form,
  Input,
  Label,
  useForm,
} from '@xorkevin/nuke/component/form';
import {
  isArray,
  isNil,
  isNonNil,
  isObject,
  isSignalAborted,
  modClassNames,
  parseJSON,
  parseURL,
  sleep,
  useDebounceCallback,
} from '@xorkevin/nuke/computil';
import {useRoute, useRouter} from '@xorkevin/nuke/router';

import styles from './home.module.css';

import {WSContext} from '@/net/ws.js';

type DirEntry = {name: string; dir?: boolean};
type SearchRes = {
  entries: DirEntry[];
  searchDir: string;
};

type SearchListEntryFileProps = {
  name: string;
  searchDir: string;
  load: (v: string) => void;
};

const SearchListEntryFile: FC<SearchListEntryFileProps> = ({
  name,
  searchDir,
  load,
}) => {
  const handleClick = useCallback(() => {
    load(`${searchDir.length > 0 ? `${searchDir}/` : ''}${name}`);
  }, [load, searchDir, name]);
  return (
    <Button variant={ButtonVariant.Subtle} onClick={handleClick}>
      {name}
    </Button>
  );
};

const ChevronRight = () => (
  <svg
    aria-hidden={true}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    fill="none"
  >
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

type SearchListEntryDirProps = {
  name: string;
  searchDir: string;
  search: (v: string) => void;
};

const SearchListEntryDir: FC<SearchListEntryDirProps> = ({
  name,
  searchDir,
  search,
}) => {
  const handleClick = useCallback(() => {
    search(`${searchDir.length > 0 ? `${searchDir}/` : ''}${name}`);
  }, [search, searchDir, name]);
  return (
    <Button variant={ButtonVariant.Subtle} onClick={handleClick}>
      {name} <ChevronRight />
    </Button>
  );
};

type SearchListEntryProps = {
  entry: DirEntry;
  searchDir: string;
  search: (v: string) => void;
  load: (v: string) => void;
};

const SearchListEntry: FC<SearchListEntryProps> = ({
  entry,
  searchDir,
  search,
  load,
}) => {
  return (
    <li>
      {entry.dir === true ? (
        <SearchListEntryDir
          name={entry.name}
          searchDir={searchDir}
          search={search}
        />
      ) : (
        <SearchListEntryFile
          name={entry.name}
          searchDir={searchDir}
          load={load}
        />
      )}
    </li>
  );
};

const ChevronLeft = () => (
  <svg
    aria-hidden={true}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    fill="none"
  >
    <polyline points="16 6 10 12 16 18" />
  </svg>
);

type SearchListProps = {
  searchRes: SearchRes;
  search: (v: string) => void;
  load: (v: string) => void;
};

const SearchList: FC<SearchListProps> = ({searchRes, search, load}) => {
  const handleHome = useCallback(() => {
    search('');
  }, [search]);

  const searchDir = searchRes.searchDir;
  const handleBack = useCallback(() => {
    const idx = searchDir.lastIndexOf('/');
    if (idx >= 0) {
      search(searchDir.slice(0, idx));
    } else {
      search('');
    }
  }, [searchDir, search]);

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <ButtonGroup gap>
        <Button variant={ButtonVariant.Subtle} onClick={handleHome}>
          Home
        </Button>
        {searchDir.length > 0 && (
          <Button variant={ButtonVariant.Subtle} onClick={handleBack}>
            <ChevronLeft /> Back
          </Button>
        )}
      </ButtonGroup>
      <ul className={modClassNames(styles, 'searchlist')}>
        {searchRes.entries.map((v) => (
          <SearchListEntry
            key={v.name}
            entry={v}
            searchDir={searchRes.searchDir}
            search={search}
            load={load}
          />
        ))}
      </ul>
    </Flex>
  );
};

const formInitState = () => ({search: ''});

type SearchProps = {
  load: (v: string) => void;
};

const Search: FC<SearchProps> = ({load}) => {
  const form = useForm(formInitState);

  const [searchRes, setSearchRes] = useState<SearchRes | undefined>(undefined);

  const search = useDebounceCallback(
    useCallback(
      async (signal: AbortSignal, searchDir: string) => {
        const u = parseURL(`/fs/${searchDir}`, window.location.origin);
        if (isNil(u)) {
          return;
        }
        const params = new URLSearchParams({
          dir: 't',
        });
        u.search = params.toString();
        try {
          const res = await fetch(u);
          if (isSignalAborted(signal)) {
            return;
          }
          const body = (await res.json()) as unknown;
          if (
            !isObject(body) ||
            !('entries' in body) ||
            !isArray(body.entries) ||
            body.entries.some(
              (v) =>
                !isObject(v) ||
                !('name' in v) ||
                typeof v.name !== 'string' ||
                ('dir' in v && typeof v.dir !== 'boolean'),
            )
          ) {
            console.error('Invalid search response', {
              cause: body,
            });
            return;
          }
          setSearchRes({
            entries: body.entries as DirEntry[],
            searchDir,
          });
        } catch (err) {
          console.error('Failed to search content', {cause: err});
          if (isSignalAborted(signal)) {
            return;
          }
        }
      },
      [setSearchRes],
    ),
    250,
  );

  const submitArgs = useRef(form.state.search);
  submitArgs.current = form.state.search;
  const handleSubmit = useCallback(() => {
    search(undefined, submitArgs.current);
  }, [search, submitArgs]);

  const formUpdate = form.update;
  const formUpdateSearch = useCallback(
    (v: string) => {
      formUpdate('search', v);
      search(undefined, v);
    },
    [formUpdate, search],
  );

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <Form form={form} onSubmit={handleSubmit}>
        <Flex alignItems={FlexAlignItems.Start} gap="8px">
          <Field>
            <Flex className={FlexClasses.Grow}>
              <Label>Search</Label>
              <Input name="search" className={FlexClasses.Grow} />
            </Flex>
          </Field>
          <ButtonGroup gap>
            <Button variant={ButtonVariant.Primary} type="submit">
              <ChevronRight />
            </Button>
          </ButtonGroup>
        </Flex>
      </Form>
      {isNonNil(searchRes) && (
        <SearchList
          searchRes={searchRes}
          search={formUpdateSearch}
          load={load}
        />
      )}
    </Flex>
  );
};

type VideoProps = {
  name: string;
  url: string;
};

const Video: FC<VideoProps> = ({name, url}) => {
  const videoElem = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (isNonNil(videoElem.current)) {
      videoElem.current.addEventListener(
        'error',
        () => {
          console.error('Video resource error', {
            cause: videoElem.current?.error,
          });
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'abort',
        () => {
          console.error('Video resource abort');
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'stalled',
        () => {
          console.error('Video resource stalled');
        },
        {signal: controller.signal},
      );

      videoElem.current.addEventListener(
        'pause',
        () => {
          console.info('Pause video');
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'play',
        () => {
          console.info('Play video');
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'seeking',
        () => {
          console.info('Seeking video');
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'canplaythrough',
        () => {
          console.info('Can playthrough video');
        },
        {signal: controller.signal},
      );
      videoElem.current.addEventListener(
        'waiting',
        () => {
          console.info('Waiting video');
        },
        {signal: controller.signal},
      );
    }
    return () => {
      controller.abort();
    };
  }, [videoElem]);

  return (
    <Flex dir={FlexDir.Col} gap="8px">
      <video
        ref={videoElem}
        src={url.length > 0 ? url : undefined}
        controls={url.length > 0}
        muted
      />
      <code>{name}</code>
    </Flex>
  );
};

const Checkmark = () => (
  <svg
    aria-hidden={true}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    fill="none"
  >
    <polyline points="5 12 10 17 20 7" />
  </svg>
);

type MemberStatus = {
  name: string;
  ping: number | undefined;
};

type MemberListProps = {
  members: Record<string, MemberStatus>;
};

const MemberList: FC<MemberListProps> = ({members}) => {
  return (
    <ul className={modClassNames(styles, 'memberlist')}>
      {Object.entries(members).map(([id, member]) => (
        <li key={id}>
          {member.name} (
          <code>
            {isNil(member.ping)
              ? '-'
              : member.ping < 0
                ? '>5000'
                : String(member.ping)}
            ms
          </code>
          )
        </li>
      ))}
    </ul>
  );
};

type RoomStatus = {
  members: Record<string, MemberStatus>;
  video: string | undefined;
};

const nameInitState = () => ({name: crypto.randomUUID() as string});

type StatusBarProps = {
  load: (v: string) => void;
};

const StatusBar: FC<StatusBarProps> = ({load}) => {
  const {ws, pingRef} = useContext(WSContext);

  const router = useRouter();
  const routerURL = router.url;
  const room = useMemo(() => {
    const v = routerURL.searchParams.get('room');
    if (isNil(v) || v.length === 0) {
      return;
    }
    return v;
  }, [routerURL]);

  const {navigate} = useRoute();

  const createNewRoom = useCallback(() => {
    const search = new URLSearchParams({
      room: crypto.randomUUID(),
    }).toString();
    navigate({search}, {replace: true});
  }, [navigate]);

  const [roomStatus, setRoomStatus] = useState<RoomStatus | undefined>(
    undefined,
  );

  const form = useForm(nameInitState);

  const [name, setName] = useState(form.state.name);
  const lastStatus = useRef<{id: string; at: number} | undefined>(undefined);
  const sendPing = useCallback(() => {
    if (!ws.isOpen() || isNil(room)) {
      return;
    }
    const id = crypto.randomUUID();
    ws.send(
      JSON.stringify({
        id,
        ch: 'arcade.room',
        v: {
          room,
          name,
          ping: pingRef.current,
        },
      }),
    );
    lastStatus.current = {id, at: performance.now()};
  }, [ws, lastStatus, room, name, pingRef]);
  useEffect(() => {
    setRoomStatus(undefined);
    if (isNil(room)) {
      return;
    }

    const controller = new AbortController();

    let timer: number | undefined;
    ws.addEventListener(
      'open',
      () => {
        lastStatus.current = undefined;
        if (isNonNil(timer)) {
          clearInterval(timer);
          timer = undefined;
        }
        sendPing();
        timer = setInterval(() => {
          if (isNonNil(lastStatus.current)) {
            setRoomStatus(undefined);
            lastStatus.current = undefined;
          }
          sendPing();
        }, 5000);
      },
      {signal: controller.signal},
    );
    ws.addEventListener(
      'close',
      () => {
        setRoomStatus(undefined);
        lastStatus.current = undefined;
        if (isNonNil(timer)) {
          clearInterval(timer);
          timer = undefined;
        }
      },
      {signal: controller.signal},
    );

    ws.addEventListener(
      'message',
      (ev: MessageEvent<string>) => {
        const data = parseJSON(ev.data);
        if (!isObject(data)) {
          return;
        }
        if (
          !('id' in data) ||
          !('ch' in data) ||
          !('v' in data) ||
          isNil(lastStatus.current) ||
          data.id !== lastStatus.current.id ||
          data.ch !== 'arcade.room' ||
          !isObject(data.v) ||
          !('members' in data.v) ||
          !isObject(data.v.members) ||
          Object.values(data.v.members).some(
            (v: unknown) =>
              !isObject(v) ||
              !('name' in v) ||
              typeof v.name !== 'string' ||
              ('ping' in v && typeof v.ping !== 'number'),
          ) ||
          ('video' in data.v && typeof data.v !== 'string')
        ) {
          return;
        }
        setRoomStatus({
          members: data.v.members as Record<string, MemberStatus>,
          video: (data.v as unknown as {video: string | undefined}).video,
        });
      },
      {signal: controller.signal},
    );

    void (async () => {
      await sleep(250, {signal: controller.signal});
      if (isSignalAborted(controller.signal)) {
        return;
      }
      sendPing();
    })();

    return () => {
      controller.abort();
      if (isNonNil(timer)) {
        clearInterval(timer);
      }
    };
  }, [ws, room, setRoomStatus, lastStatus, sendPing, load]);

  const formState = form.state;
  const handleSubmit = useCallback(() => {
    setName(formState.name);
  }, [setName, formState]);

  return (
    <Flex dir={FlexDir.Col} gap="8px">
      <Flex alignItems={FlexAlignItems.Start} gap="8px">
        <ButtonGroup gap>
          <Button variant={ButtonVariant.Subtle} onClick={createNewRoom}>
            New Room
          </Button>
        </ButtonGroup>
        <Form form={form} onSubmit={handleSubmit}>
          <Flex alignItems={FlexAlignItems.Start} gap="8px">
            <Flex gap="8px">
              <Field>
                <Flex>
                  <Label>Username</Label>
                  <Input name="name" />
                </Flex>
              </Field>
            </Flex>
            <ButtonGroup gap>
              <Button type="submit">
                <Checkmark />
              </Button>
            </ButtonGroup>
          </Flex>
        </Form>
      </Flex>
      {isNonNil(roomStatus) && <MemberList members={roomStatus.members} />}
    </Flex>
  );
};

const fsOrigin = ARCADE_FS_ORIGIN;

const Home: FC = () => {
  const [videoURL, setVideoURL] = useState({name: '', url: ''});

  const loadVideo = useDebounceCallback(
    useCallback(
      (_signal: AbortSignal, name: string) => {
        const u = parseURL(`/fs/${name}`, fsOrigin);
        if (isNil(u)) {
          return;
        }
        setVideoURL({name, url: u.toString()});
      },
      [setVideoURL],
    ),
    250,
  );

  const load = useCallback(
    (video: string) => {
      loadVideo(undefined, video);
    },
    [loadVideo],
  );

  return (
    <Box size={BoxSize.S6} center padded>
      <Flex dir={FlexDir.Col} gap="16px">
        {videoURL.url.length > 0 && (
          <Video name={videoURL.name} url={videoURL.url} />
        )}
        <StatusBar load={load} />
        <Search load={load} />
      </Flex>
    </Box>
  );
};

export default Home;
