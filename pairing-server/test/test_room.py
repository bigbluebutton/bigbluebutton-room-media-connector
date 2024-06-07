import asyncio
import pytest
from async_timeout import timeout
from quart.testing.connections import WebsocketDisconnectError

from bbb_pairing_server.app import app
import json


def with_timeout(t):
    def wrapper(f):
        async def run(*args, **kwargs):
            async with timeout(t):
                return await f(*args, **kwargs)
        return run
    return wrapper


@pytest.mark.asyncio
@with_timeout(1)
async def test_room_get_pin():
    client_room = app.test_client()
    async with client_room.websocket('/ws_room') as ws_room:
        await ws_room.send(json.dumps({'config': {'foo': 'bar'}}))
        response = await ws_room.receive()
        response = json.loads(response)
        assert 'pin' in response
        assert 'timeout' in response
        assert isinstance(response['pin'], int)
        assert isinstance(response['timeout'], int)
        await ws_room.close(1000)
    await asyncio.sleep(0.01)


@pytest.mark.asyncio
@with_timeout(1)
async def test_room_no_config():
    client_room = app.test_client()
    async with client_room.websocket('/ws_room') as ws_room:
        await ws_room.send(json.dumps({}))
        with pytest.raises(WebsocketDisconnectError):
            response = await ws_room.receive()  # noqa: F841


@pytest.mark.asyncio
@with_timeout(1)
async def test_room_no_json():
    client_room = app.test_client()
    async with client_room.websocket('/ws_room') as ws_room:
        await ws_room.send(b'foobar')
        with pytest.raises(WebsocketDisconnectError):
            response = await ws_room.receive()  # noqa: F841


@pytest.mark.asyncio
@with_timeout(1)
async def test_room_join_cycle():
    client_room = app.test_client()
    client_plugin = app.test_client()
    async with client_room.websocket('/ws_room') as ws_room:
        async with client_plugin.websocket('/ws') as ws_plugin:
            await ws_room.send(json.dumps({'config': {'foo': 'bar'}}))
            res_pin = json.loads(await ws_room.receive())
            pin = res_pin['pin']

            await ws_plugin.send(json.dumps({'pin': pin}))
            res_status = json.loads(await ws_plugin.receive())
            assert res_status['status'] == 200
            urldata = {'foo': 'http://bar'}
            await ws_plugin.send(json.dumps({'urls': urldata}))
            res_urls = json.loads(await ws_room.receive())
            assert res_urls['urls'] == urldata
            await ws_plugin.close(1000)
        await ws_room.close(1000)
