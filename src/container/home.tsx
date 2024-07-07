import {
  Box,
  BoxSize,
  Flex,
  FlexAlignItems,
  FlexDir,
} from '@xorkevin/nuke/component/box';
import {
  ButtonGroup,
  Button,
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
  Result,
  isNil,
  isNonNil,
  isResOk,
  isSignalAborted,
  parseURL,
  useDebounceCallback,
} from '@xorkevin/nuke/computil';
import {useCallback, useRef, useState, type FC} from 'react';

const formInitState = () => ({search: ''});

const Search: FC = () => {
  const form = useForm(formInitState);

  const formState = useRef(form.state);
  formState.current = form.state;

  const [searchRes, setSearchRes] = useState<Result<string, Error> | undefined>(
    undefined,
  );

  const search = useDebounceCallback(
    useCallback(
      async (signal: AbortSignal) => {
        const u = parseURL(
          `/fs/${formState.current.search}`,
          window.location.origin,
        );
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
          setSearchRes({value: JSON.stringify(body, undefined, '  ')});
        } catch (err) {
          if (isSignalAborted(signal)) {
            return;
          }
          setSearchRes({
            err: new Error('Failed to search content', {cause: err}),
          });
        }
      },
      [formState, setSearchRes],
    ),
    384,
  );

  const handleSubmit = useCallback(() => {
    search();
  }, [search]);

  return (
    <Flex dir={FlexDir.Col} gap="16px">
      <Form form={form} onSubmit={handleSubmit}>
        <Flex dir={FlexDir.Col} alignItems={FlexAlignItems.Start} gap="16px">
          <Field>
            <Flex dir={FlexDir.Col}>
              <Label>Search</Label>
              <Input name="search" />
            </Flex>
          </Field>
          <ButtonGroup gap>
            <Button
              variant={ButtonVariant.Primary}
              type="submit"
              name="submit"
              value="submit"
            >
              Search
            </Button>
          </ButtonGroup>
        </Flex>
      </Form>
      {isNonNil(searchRes) && (
        <pre>
          {isResOk(searchRes) ? searchRes.value : searchRes.err.toString()}
        </pre>
      )}
    </Flex>
  );
};

const Home: FC = () => {
  return (
    <Box size={BoxSize.S6} center>
      <Search />
    </Box>
  );
};

export default Home;
