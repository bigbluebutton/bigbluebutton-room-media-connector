import asyncio
import aioredis
from async_timeout import timeout
from quart import Quart, websocket, send_file, request
import json
import random
import traceback

app = Quart(__name__)

redis_url = 'redis://127.0.0.1'
pin_rollover = 600

def validate_client_config(config) -> bool:
    return True
    if type(config) != list:
        return False
    for client in config:
        if set(client.keys()) != set(['name', 'has_audio']):
            return False
    return True

async def generate_pin(redis):
    while True:
        pin = random.randrange(1e5, 1e6 - 1)
        redis_key = f'bbb:pins:{pin}'
        has_key = await redis.get(redis_key)
        if has_key is None:
            return pin

async def generate_pin_task(channel, config):
    print(f"pin task: started {channel}")
    redis = await aioredis.from_url(redis_url)
    pub = await aioredis.from_url(redis_url)
    try:
        while True:
            pin = await generate_pin(redis)
            print(f"pin task: generated pin {pin} for {channel}")
            await pub.publish(channel, json.dumps({'pin': pin, 'timeout': pin_rollover}))
            await asyncio.sleep(pin_rollover)
            await asyncio.sleep(0.0)
    except asyncio.CancelledError:
        print(f"pin task: cancelled for channel {channel}")
        return
    except Exception as e:
        print("exception 2")
        traceback.print_exception(e)
        return

@app.websocket('/ws_room')
async def handle_room() -> None:
    redis = await aioredis.from_url(redis_url)
    psub = None
    pin_task = None
    forward_task = None
    try:
        data = await websocket.receive()
        data = json.loads(data)
        config = data['config']
        client_id = await redis.client_id()
        psub = redis.pubsub()
        channel_name = f'bbb:client:{client_id}'
        print(channel_name)
        pin_task = asyncio.create_task(generate_pin_task(channel_name, config), name=f"pin_generate_{client_id}")
        async with psub as p:
            await p.subscribe(channel_name)
            while True:
                try:
                    async for msg in p.listen():
                        print(f"room received: {msg}")
                        if msg['type'] != 'message':
                            continue
                        if msg['data'] is not None:
                            msg = json.loads(msg['data'])
                            if 'pin' in msg:
                                pin = msg['pin']
                                await redis.set(f'bbb:pins:{pin}', json.dumps(config), ex=pin_rollover)
                                await redis.set(f'bbb:clients:{pin}', client_id, ex=pin_rollover)
                                await websocket.send(json.dumps({'action': 'new_pin', 'pin': pin, 'timeout': pin_rollover}))
                            elif 'start' in msg:
                                await websocket.send(json.dumps({'action': 'start', 'urls': msg['urls'], 'pairing_pin': msg['pairing_pin']}))
                                plugin_channel = f"bbb:client:{msg['client_id']}"
                                forward_task = asyncio.create_task(forward_from_websocket(plugin_channel, websocket))
                            elif 'stop_pin_generation' in msg:
                                pin_task.cancel()
                            elif 'start_pin_generation' in msg:
                                if pin_task is not None or pin_task.cancelled():
                                    pin_task = asyncio.create_task(generate_pin_task(channel_name, config))
                except asyncio.TimeoutError:
                    print("room timeout")
            await p.unsubscribe(channel_name)
    finally:
        print("room close")
        await redis.close()
        if psub:
            await psub.close()
        if pin_task:
            pin_task.cancel()
        if forward_task:
            forward_task.cancel()

async def send_client(client_id, redis, msg):
    print(f"publish to {client_id}: {msg}")
    await redis.publish(f"bbb:client:{client_id}", json.dumps(msg))

@app.websocket('/ws')
async def handle_ws() -> None:
    pin_generation_stopped = False
    redis = await aioredis.from_url(redis_url)
    # pin provided by bbb plugin
    pin = None
    # verification pin after conn established
    pairing_pin = random.randrange(1e3, 1e4 - 1)
    my_client_id = await redis.client_id()
    forward_task = None
    try:
        data = await websocket.receive()
        data = json.loads(data)
        print(f"plugin received {data}")
        pin = data['pin']
        config = await redis.get(f'bbb:pins:{pin}')
        client_id = await redis.get(f'bbb:clients:{pin}')
        if config is None or client_id is None:
            await websocket.send(json.dumps({'status': 404, 'msg': 'PIN not found'}))
            return
        if not validate_client_config(config):
            await websocket.send(json.dumps({'status': 500, 'msg': 'invalid client config'}))
            return
        client_id = int(client_id)
        print("sende stop_pin_generation")
        await send_client(client_id, redis, {'stop_pin_generation': True})
        pin_generation_stopped = True
        print("gesendet")
        await websocket.send(json.dumps({'status': 200, 'msg': 'ok', 'config': json.loads(config)}))
        # jetzt bekommen wir die URLs
        print("Warte auf URLS")
        data = await websocket.receive()
        print(f"empfangen: {data}")
        data = json.loads(data)
        if not 'urls' in data:
            await websocket.send(json.dumps({'status': 500, 'msg': 'invalid format. Expecting urls'}))
            return
        await send_client(client_id, redis, {'start': True, 'urls': data['urls'], 'pairing_pin': pairing_pin, 'client_id': my_client_id})
        await websocket.send(json.dumps({'status': 200, 'msg': 'pairing', 'pairing_pin': pairing_pin}))
        channel_name = f'bbb:client:{my_client_id}'
        forward_task = asyncio.create_task(forward_from_pubsub(channel_name, websocket))
        while True:
            data = await websocket.receive()
            data = json.loads(data)
            await send_client(client_id, redis, data)

        # wait for session terminate

    except KeyError:
        await websocket.send(json.dumps({'status': 500, 'msg': 'invalid format'}))
        return
    except Exception as e:
        traceback.print_exception(e)
        return
    finally:
        print("closing plugin")
        if pin_generation_stopped:
            await send_client(client_id, redis, {'start_pin_generation': True})
        if forward_task:
            forward_task.cancel()
        await redis.close()
        await websocket.close(1007)
        print("closed plugin")
        return

async def forward_from_websocket(channel, websocket):
    redis = await aioredis.from_url(redis_url)
    try:
        while True:
            data = await websocket.receive()
            data = json.loads(data)
            if 'type' in data and data['type'] == 'ping':
                continue
            await redis.publish(channel, json.dumps(data))
    except asyncio.CancelledError:
        return

async def forward_from_pubsub(channel, websocket):
    redis = await aioredis.from_url(redis_url)
    psub = redis.pubsub()
    async with psub as p:
        await p.subscribe(channel)
        try:
            while True:
                async for msg in p.listen():
                    print(f"{channel} received: {msg}")
                    if msg['type'] != 'message':
                        continue
                    if msg['data'] is not None:
                        await websocket.send(msg['data'].decode('utf-8'))
        except asyncio.CancelledError:
            return


def run() -> None:
    app.run()
