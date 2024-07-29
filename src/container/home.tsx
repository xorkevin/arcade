import {
  type FC,
  type MutableRefObject,
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

const fsOrigin = ARCADE_FS_ORIGIN;
const fsPathPrefix = '/fs/';

const formInitState = () => ({search: ''});

type SearchProps = {
  room: string | undefined;
};

const Search: FC<SearchProps> = ({room}) => {
  const ws = useContext(WSContext);

  const loadVideo = useDebounceCallback(
    useCallback(
      (_signal: AbortSignal, name: string) => {
        const u = parseURL(`${fsPathPrefix}${name}`, fsOrigin);
        if (isNil(u)) {
          return;
        }
        if (!ws.isOpen() || isNil(room)) {
          return;
        }
        ws.send(
          JSON.stringify({
            ch: 'arcade.room.ctl',
            v: {
              room,
              video: u.toString(),
              pos: 0,
              play: false,
            },
          }),
        );
      },
      [ws, room],
    ),
    125,
  );

  const load = useCallback(
    (name: string) => {
      loadVideo(undefined, name);
    },
    [loadVideo],
  );

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
    125,
  );

  const formState = form.state;
  const handleSubmit = useCallback(() => {
    search(undefined, formState.search);
  }, [search, formState]);

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
  elem: HTMLVideoElement | null;
  setElem: (e: HTMLVideoElement) => void;
  url: string;
};

const Video: FC<VideoProps> = ({elem, setElem, url}) => {
  useEffect(() => {
    if (isNil(elem)) {
      return;
    }

    const controller = new AbortController();
    elem.addEventListener(
      'error',
      () => {
        console.error('Video resource error', {
          cause: elem.error,
        });
      },
      {signal: controller.signal},
    );
    elem.addEventListener(
      'abort',
      () => {
        console.error('Video resource abort');
      },
      {signal: controller.signal},
    );
    elem.addEventListener(
      'stalled',
      () => {
        console.error('Video resource stalled');
      },
      {signal: controller.signal},
    );
    return () => {
      controller.abort();
    };
  }, [elem]);

  const seekHalf = useCallback(() => {
    if (isNil(elem) || Number.isNaN(elem.duration)) {
      return;
    }
    elem.currentTime = elem.duration / 2;
  }, [elem]);

  const pause = useCallback(() => {
    if (isNil(elem)) {
      return;
    }
    elem.pause();
  }, [elem]);

  const name = useMemo(() => {
    const u = parseURL(url);
    if (isNil(u)) {
      return url;
    }
    if (u.origin === fsOrigin && u.pathname.startsWith(fsPathPrefix)) {
      const name = u.pathname.slice(fsPathPrefix.length);
      try {
        return decodeURI(name);
      } catch (err) {
        // ignore invalid uri
      }
      return name;
    }
    return url;
  }, [url]);

  return (
    <Flex dir={FlexDir.Col} gap="8px">
      <video ref={setElem} src={url} controls={true} muted />
      <Flex alignItems={FlexAlignItems.Start} gap="8px">
        <code>{name}</code>
        <ButtonGroup gap>
          <Button variant={ButtonVariant.Subtle} onClick={seekHalf}>
            Seek 50%
          </Button>
          <Button variant={ButtonVariant.Subtle} onClick={pause}>
            Pause
          </Button>
        </ButtonGroup>
      </Flex>
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
  pos: number;
  play: boolean;
  at: number;
};

type RoomStatus = {
  members: Record<string, MemberStatus>;
  at: number;
  localAt: number;
  ctr: number;
};

const approxPos = (
  play: boolean,
  pos: number,
  ping: number | undefined,
  at: number,
  serverAt: number,
  localPing: number | undefined,
  localAt: number,
  curTime: number,
): number => {
  if (!play || isNil(ping) || isNil(localPing)) {
    return pos;
  }
  if (ping < 0) {
    ping = 5000;
  }
  if (localPing < 0) {
    localPing = 5000;
  }
  return pos + ping + (serverAt - at) + localPing + (curTime - localAt);
};

const curTimeInitState = () => performance.now();

type MemberListProps = {
  roomStatus: RoomStatus;
  pingRef: {current: number | undefined};
};

const MemberList: FC<MemberListProps> = ({roomStatus, pingRef}) => {
  const [curTime, setCurTime] = useState(curTimeInitState);
  useEffect(() => {
    const timer = setInterval(() => {
      setCurTime(performance.now());
    }, 125);
    return () => {
      clearInterval(timer);
    };
  }, [setCurTime]);
  return (
    <ul className={modClassNames(styles, 'memberlist')}>
      {Object.entries(roomStatus.members).map(([id, member]) => (
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
          ) @{' '}
          {Math.floor(
            approxPos(
              member.play,
              member.pos,
              member.ping,
              member.at,
              roomStatus.at,
              pingRef.current,
              roomStatus.localAt,
              curTime,
            ) / 1000,
          )}
          s {member.play ? 'playing' : 'paused'}
        </li>
      ))}
    </ul>
  );
};

const nameInitState = () => ({name: 'Anonymous'});

type RoomControlsProps = {
  sendPing: () => void;
  nameRef: MutableRefObject<string>;
};

const RoomControls: FC<RoomControlsProps> = ({nameRef, sendPing}) => {
  const {navigate} = useRoute();

  const createNewRoom = useCallback(() => {
    const search = new URLSearchParams({
      room: crypto.randomUUID(),
    }).toString();
    navigate({search}, {replace: true});
  }, [navigate]);

  const form = useForm(nameInitState);

  const setName = useDebounceCallback(
    useCallback(
      (_signal: AbortSignal, name: string) => {
        nameRef.current = name;
        sendPing();
      },
      [nameRef, sendPing],
    ),
    125,
  );

  const formState = form.state;
  const handleSubmit = useCallback(() => {
    setName(undefined, formState.name);
  }, [setName, formState]);

  return (
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
            <Button variant={ButtonVariant.Subtle} type="submit">
              <Checkmark />
            </Button>
          </ButtonGroup>
        </Flex>
      </Form>
    </Flex>
  );
};

const WRAPPING_THRESHOLD = 2 ** 31;

const abs = (a: number, b: number) => {
  if (a > b) {
    return a - b;
  }
  return b - a;
};

const wrappingLeq = (a: number, b: number) => {
  if (abs(a, b) < WRAPPING_THRESHOLD) {
    return a <= b;
  }
  return a > b;
};

type VideoState = {
  video: string;
  pos: number;
  play: boolean;
  ctr: number;
};

type StatusBarProps = {
  room: string | undefined;
  videoElem: HTMLVideoElement | null;
  load: (v: string) => void;
};

const StatusBar: FC<StatusBarProps> = ({room, videoElem, load}) => {
  const ws = useContext(WSContext);

  const memberStatusRef = useRef({pos: 0, play: false});
  const nameRef = useRef('Anonymous');
  const pingRef = useRef<number | undefined>(undefined);
  const lastPing = useRef<{id: string; at: number} | undefined>(undefined);
  const sendPing = useCallback(() => {
    if (!ws.isOpen() || isNil(room)) {
      return;
    }
    const id = crypto.randomUUID();
    ws.send(
      JSON.stringify({
        id,
        ch: 'arcade.room.ping',
        v: {
          room,
          name: nameRef.current,
          ping: pingRef.current,
          pos: memberStatusRef.current.pos,
          play: memberStatusRef.current.play,
        },
      }),
    );
    lastPing.current = {id, at: performance.now()};
  }, [ws, lastPing, room, memberStatusRef, nameRef, pingRef]);

  const [roomStatus, setRoomStatus] = useState<RoomStatus | undefined>(
    undefined,
  );
  const videoState = useRef<VideoState>({
    video: '',
    pos: 0,
    play: false,
    ctr: -1,
  });

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
        lastPing.current = undefined;
        if (isNonNil(timer)) {
          clearInterval(timer);
          timer = undefined;
        }
        sendPing();
        timer = setInterval(() => {
          if (isNonNil(lastPing.current)) {
            setRoomStatus(undefined);
            pingRef.current = -1;
            lastPing.current = undefined;
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
        pingRef.current = undefined;
        lastPing.current = undefined;
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
        if (!isObject(data) || !('ch' in data)) {
          return;
        }

        switch (data.ch) {
          case 'arcade.room.ping': {
            if (
              !('v' in data) ||
              !isObject(data.v) ||
              !('room' in data.v) ||
              data.v.room !== room ||
              !('members' in data.v) ||
              !isObject(data.v.members) ||
              Object.values(data.v.members).some(
                (v: unknown) =>
                  !isObject(v) ||
                  !('name' in v) ||
                  typeof v.name !== 'string' ||
                  ('ping' in v && typeof v.ping !== 'number') ||
                  !('pos' in v) ||
                  typeof v.pos !== 'number' ||
                  !('play' in v) ||
                  typeof v.play !== 'boolean' ||
                  !('at' in v) ||
                  typeof v.at !== 'number',
              ) ||
              !('video' in data.v) ||
              typeof data.v.video !== 'string' ||
              !('pos' in data.v) ||
              typeof data.v.pos !== 'number' ||
              !('play' in data.v) ||
              typeof data.v.play !== 'boolean' ||
              !('ctlat' in data.v) ||
              typeof data.v.ctlat !== 'number' ||
              !('at' in data.v) ||
              typeof data.v.at !== 'number' ||
              !('d' in data.v) ||
              typeof data.v.d !== 'number' ||
              !('ctr' in data.v) ||
              typeof data.v.ctr !== 'number'
            ) {
              return;
            }

            if (
              isNonNil(lastPing.current) &&
              'id' in data &&
              data.id === lastPing.current.id
            ) {
              const ping = Math.max(
                Math.ceil(performance.now() - lastPing.current.at - data.v.d),
                1,
              );
              pingRef.current = ping;
              lastPing.current = undefined;
            }
            const next = {
              members: data.v.members as Record<string, MemberStatus>,
              at: data.v.at,
              localAt: performance.now(),
              ctr: data.v.ctr,
            };
            setRoomStatus((state) => {
              if (isNonNil(state) && wrappingLeq(next.ctr, state.ctr)) {
                return state;
              }
              return next;
            });
            return;
          }

          case 'arcade.room.ctl': {
            if (
              !('v' in data) ||
              !isObject(data.v) ||
              !('room' in data.v) ||
              data.v.room !== room ||
              !('video' in data.v) ||
              typeof data.v.video !== 'string' ||
              !('pos' in data.v) ||
              typeof data.v.pos !== 'number' ||
              !('play' in data.v) ||
              typeof data.v.play !== 'boolean' ||
              !('ctr' in data.v) ||
              typeof data.v.ctr !== 'number'
            ) {
              return;
            }

            if (wrappingLeq(data.v.ctr, videoState.current.ctr)) {
              return;
            }

            if (data.v.video !== videoState.current.video) {
              videoState.current.video;
              videoState.current.pos = data.v.pos;
              videoState.current.play = data.v.play;
              videoState.current.ctr = data.v.ctr;
              load(data.v.video);
              return;
            }
            return;
          }
        }
      },
      {signal: controller.signal},
    );

    void (async () => {
      await sleep(125, {signal: controller.signal});
      if (isSignalAborted(controller.signal) || !ws.isOpen()) {
        return;
      }

      lastPing.current = undefined;
      if (isNonNil(timer)) {
        clearInterval(timer);
        timer = undefined;
      }
      sendPing();
      timer = setInterval(() => {
        if (isNonNil(lastPing.current)) {
          setRoomStatus(undefined);
          pingRef.current = -1;
          lastPing.current = undefined;
        }
        sendPing();
      }, 5000);
    })();

    return () => {
      controller.abort();
      if (isNonNil(timer)) {
        clearInterval(timer);
      }
    };
  }, [ws, room, setRoomStatus, lastPing, sendPing, pingRef, videoState, load]);

  const updMemberStatus = useCallback(() => {
    if (isNil(videoElem)) {
      return;
    }
    memberStatusRef.current.pos = Math.floor(videoElem.currentTime * 1000);
    memberStatusRef.current.play = !videoElem.paused;
  }, [videoElem, memberStatusRef]);
  const updAndPingMemberStatus = useCallback(() => {
    updMemberStatus();
    sendPing();
  }, [updMemberStatus, sendPing]);
  useEffect(() => {
    if (isNil(videoElem)) {
      return;
    }

    const controller = new AbortController();
    videoElem.addEventListener(
      'loadedmetadata',
      () => {
        console.info('Load video', {
          src: videoElem.src,
          time: videoElem.currentTime,
          play: !videoElem.paused,
        });
        updAndPingMemberStatus();
      },
      {signal: controller.signal},
    );
    videoElem.addEventListener(
      'pause',
      () => {
        console.info('Pause video', {
          time: videoElem.currentTime,
          play: !videoElem.paused,
        });
        updAndPingMemberStatus();
      },
      {signal: controller.signal},
    );
    videoElem.addEventListener(
      'play',
      () => {
        console.info('Play video', {
          time: videoElem.currentTime,
          play: !videoElem.paused,
        });
        updAndPingMemberStatus();
      },
      {signal: controller.signal},
    );
    videoElem.addEventListener(
      'seeking',
      () => {
        console.info('Seeking video', {time: videoElem.currentTime});
      },
      {signal: controller.signal},
    );
    videoElem.addEventListener(
      'canplaythrough',
      () => {
        console.info('Can play through video');
      },
      {signal: controller.signal},
    );
    videoElem.addEventListener(
      'waiting',
      () => {
        console.info('Waiting video');
      },
      {signal: controller.signal},
    );

    videoElem.addEventListener(
      'timeupdate',
      () => {
        updMemberStatus();
      },
      {signal: controller.signal},
    );
    updMemberStatus();

    return () => {
      controller.abort();
    };
  }, [videoElem, updMemberStatus, updAndPingMemberStatus]);

  return (
    <Flex dir={FlexDir.Col} gap="8px">
      {isNonNil(roomStatus) && (
        <MemberList roomStatus={roomStatus} pingRef={pingRef} />
      )}
      <RoomControls sendPing={sendPing} nameRef={nameRef} />
    </Flex>
  );
};

const Home: FC = () => {
  const router = useRouter();
  const routerURL = router.url;
  const room = useMemo(() => {
    const v = routerURL.searchParams.get('room');
    if (isNil(v) || v.length === 0) {
      return undefined;
    }
    return v;
  }, [routerURL]);

  const [videoURL, setVideoURL] = useState('');
  const [videoElem, setVideoElem] = useState<HTMLVideoElement | null>(null);

  const setVideo = useDebounceCallback(
    useCallback(
      (_signal: AbortSignal, url: string) => {
        setVideoURL(url);
      },
      [setVideoURL],
    ),
    125,
  );

  const loadVideoByURL = useCallback(
    (url: string) => {
      setVideo(undefined, url);
    },
    [setVideo],
  );

  return (
    <Box size={BoxSize.S6} center padded>
      <Flex dir={FlexDir.Col} gap="16px">
        {videoURL.length > 0 && (
          <Video elem={videoElem} setElem={setVideoElem} url={videoURL} />
        )}
        <StatusBar room={room} videoElem={videoElem} load={loadVideoByURL} />
        <Search room={room} />
      </Flex>
    </Box>
  );
};

export default Home;
