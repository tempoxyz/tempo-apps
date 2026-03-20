# @version ^0.3.10
# Simple Vyper contract for testing

owner: public(address)
value: public(uint256)

event ValueChanged:
    sender: indexed(address)
    newValue: uint256

@deploy
def __init__():
    self.owner = msg.sender
    self.value = 0

@external
def set_value(_value: uint256):
    self.value = _value
    log ValueChanged(msg.sender, _value)

@external
@view
def get_value() -> uint256:
    return self.value
